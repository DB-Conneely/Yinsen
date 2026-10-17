import { createHash, randomUUID } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import type postgres from "postgres";
import { readConfiguration } from "../config";
import { AppError } from "../errors";
import { operatorOnly, type ProjectActor } from "../projects/access";
import { withInvoiceLock } from "../invoices/service";
import type { InvoiceDetail } from "../invoices/queries";
import { stripeAmount, stripeClient, expireInvoiceSessions } from "./provider";

export type CheckoutAttempt = {
  id: string;
  invoiceId: string;
  fingerprint: string;
  accountId: string;
  livemode: boolean;
  amount: number;
  currency: string;
  providerAmount: number;
  idempotencyKey: string;
  parameters: Stripe.Checkout.SessionCreateParams;
  sessionId: string | null;
  state: "uncertain" | "open" | "complete" | "expired" | "failed";
  problem: string | null;
  expirationFailed: boolean;
  createdAt: number;
};

export async function invoiceAttempts(
  sql: postgres.Sql | postgres.TransactionSql,
  invoiceId: string,
): Promise<CheckoutAttempt[]> {
  return sql<
    CheckoutAttempt[]
  >`select id,invoice_id as "invoiceId",fingerprint,account_id as "accountId",livemode,amount,currency,provider_amount::float8 as "providerAmount",idempotency_key as "idempotencyKey",parameters,session_id as "sessionId",state,problem,expiration_failed as "expirationFailed",(extract(epoch from created_at)*1000)::float8 as "createdAt" from checkout_attempts where invoice_id=${invoiceId} order by created_at desc,id`;
}

function payable(invoice: InvoiceDetail): void {
  if (!["sent", "overdue"].includes(invoice.status))
    throw new AppError(
      409,
      "NOT_PAYABLE",
      "Only a sent or overdue invoice can be paid.",
    );
}

function financialFingerprint(invoice: InvoiceDetail): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        invoice.id,
        invoice.clientId,
        invoice.number,
        invoice.amount,
        invoice.currency,
        invoice.sentAt,
      ]),
    )
    .digest("hex");
}

function checkoutParameters(
  invoice: InvoiceDetail,
  id: string,
  fingerprint: string,
  amount: number,
): Stripe.Checkout.SessionCreateParams {
  const metadata = { invoice_id: invoice.id, attempt_id: id, fingerprint };
  const origin = readConfiguration().origin;
  return {
    mode: "payment",
    ui_mode: "hosted_page",
    allowed_payment_method_types: ["card"],
    adaptive_pricing: { enabled: false },
    integration_identifier: "yinsen_checkout_cardflow",
    client_reference_id: invoice.id,
    metadata,
    payment_intent_data: { metadata },
    customer_email: invoice.recipientEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: amount,
          product_data: { name: `Invoice ${invoice.number}` },
        },
      },
    ],
    success_url: `${origin}/portal/invoices/${invoice.id}?checkout=returned`,
    cancel_url: `${origin}/portal/invoices/${invoice.id}?checkout=cancelled`,
  };
}

async function reserve(
  sql: postgres.TransactionSql,
  invoice: InvoiceDetail,
): Promise<CheckoutAttempt> {
  payable(invoice);
  const active = (await invoiceAttempts(sql, invoice.id)).find((attempt) =>
    ["uncertain", "open", "complete"].includes(attempt.state),
  );
  if (active) return active;
  const amount = stripeAmount(invoice.amount, invoice.currency);
  const account = await stripeClient()
    .accounts.retrieveCurrent()
    .catch(() => {
      throw new AppError(
        503,
        "STRIPE_UNAVAILABLE",
        "Stripe could not be reached. Please retry later or use the invoice payment instructions.",
      );
    });
  const id = randomUUID();
  const fingerprint = financialFingerprint(invoice);
  const parameters = checkoutParameters(invoice, id, fingerprint, amount);
  const key = `yinsen-checkout-${id}`;
  const livemode = Boolean(readConfiguration().stripe?.key.includes("_live_"));
  await sql`insert into checkout_attempts(id,invoice_id,fingerprint,account_id,livemode,amount,currency,provider_amount,idempotency_key,parameters) values(${id},${invoice.id},${fingerprint},${account.id},${livemode},${invoice.amount},${invoice.currency},${amount},${key},${JSON.stringify(parameters)}::text::jsonb)`;
  const saved = (await invoiceAttempts(sql, invoice.id)).find(
    (attempt) => attempt.id === id,
  );
  if (!saved)
    throw new AppError(
      503,
      "CHECKOUT_UNAVAILABLE",
      "Checkout could not be saved. Please retry.",
    );
  return saved;
}

export function matchesAttempt(
  session: Stripe.Checkout.Session,
  attempt: CheckoutAttempt,
): boolean {
  return (
    session.mode === "payment" &&
    session.livemode === attempt.livemode &&
    session.client_reference_id === attempt.invoiceId &&
    session.metadata?.attempt_id === attempt.id &&
    session.metadata.fingerprint === attempt.fingerprint &&
    session.metadata.invoice_id === attempt.invoiceId &&
    session.amount_total === attempt.providerAmount &&
    session.currency === attempt.currency.toLowerCase()
  );
}

async function saveSession(
  sql: postgres.TransactionSql,
  attempt: CheckoutAttempt,
  session: Stripe.Checkout.Session,
): Promise<{ url: string } | { error: string }> {
  if (!matchesAttempt(session, attempt))
    throw new AppError(
      409,
      "CHECKOUT_MISMATCH",
      "Provider Checkout does not match this invoice.",
    );
  const state =
    session.status === "expired"
      ? "expired"
      : session.status === "complete"
        ? "complete"
        : "open";
  await sql`update checkout_attempts set session_id=${session.id},state=${state},problem=null where id=${attempt.id}`;
  if (state !== "open" || !session.url)
    return {
      error:
        state === "expired"
          ? "This Checkout expired. Retry Pay to create a new session."
          : "Checkout finished. Await the confirmed payment update; contact the operator if it remains unpaid.",
    };
  return { url: session.url };
}

async function saveProviderFailure(
  sql: postgres.TransactionSql,
  attempt: CheckoutAttempt,
  error: unknown,
): Promise<{ error: string }> {
  const definite =
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    !attempt.sessionId;
  const message = definite
    ? "Stripe could not accept this amount/currency or payment configuration. Use the invoice instructions or contact the operator."
    : "Checkout outcome could not be confirmed. Retry to recover the same attempt; do not arrange a second payment until it is reconciled.";
  await sql`update checkout_attempts set state=${definite ? "failed" : attempt.state},problem=${message} where id=${attempt.id}`;
  return { error: message };
}

async function obtain(
  sql: postgres.TransactionSql,
  attempt: CheckoutAttempt,
): Promise<{ url: string } | { error: string }> {
  if (
    !attempt.sessionId &&
    Date.now() - attempt.createdAt >= 23 * 60 * 60 * 1000
  ) {
    const message =
      "Checkout outcome remains uncertain beyond Stripe's idempotency window. Ask the operator to reconcile this attempt with Stripe; a new payment has been blocked.";
    await sql`update checkout_attempts set problem=${message} where id=${attempt.id}`;
    return { error: message };
  }
  try {
    const account = await stripeClient().accounts.retrieveCurrent();
    if (account.id !== attempt.accountId)
      return {
        error:
          "Stripe account changed. Restore the original account or reconcile this attempt before another payment.",
      };
    const session = attempt.sessionId
      ? await stripeClient().checkout.sessions.retrieve(attempt.sessionId)
      : await stripeClient().checkout.sessions.create(attempt.parameters, {
          idempotencyKey: attempt.idempotencyKey,
        });
    return await saveSession(sql, attempt, session);
  } catch (error: unknown) {
    return saveProviderFailure(sql, attempt, error);
  }
}

export async function payInvoice(
  id: string,
  actor: ProjectActor,
): Promise<{ url: string }> {
  if (actor.role !== "client")
    throw new AppError(403, "FORBIDDEN", "Only the invoice recipient can pay.");
  stripeClient();
  // Commit correlation before any provider create; later failures cannot lose the stable key.
  const attempt = await withInvoiceLock(id, actor, reserve);
  const result = await withInvoiceLock(id, actor, async (sql, invoice) => {
    payable(invoice);
    const current = (await invoiceAttempts(sql, id)).find(
      (value) => value.id === attempt.id,
    );
    if (!current)
      throw new AppError(
        503,
        "CHECKOUT_UNAVAILABLE",
        "Checkout is unavailable. Please retry.",
      );
    return obtain(sql, current);
  });
  if ("error" in result)
    throw new AppError(409, "CHECKOUT_PENDING", result.error);
  return result;
}

export async function reconcileCheckout(
  id: string,
  input: unknown,
  actor: ProjectActor,
): Promise<{ recovered: true }> {
  operatorOnly(actor);
  const { attemptId, sessionId } = z
    .object({
      attemptId: z.uuid(),
      sessionId: z.string().regex(/^cs_(test_|live_)?[A-Za-z0-9]+$/),
    })
    .strict()
    .parse(input);
  await withInvoiceLock(
    id,
    actor,
    async (sql, invoice) => {
      const attempt = (await invoiceAttempts(sql, id)).find(
        (value) => value.id === attemptId,
      );
      if (!attempt)
        throw new AppError(404, "NOT_FOUND", "Checkout attempt not found.");
      const session =
        await stripeClient().checkout.sessions.retrieve(sessionId);
      if (
        (attempt.sessionId && attempt.sessionId !== session.id) ||
        !matchesAttempt(session, attempt)
      )
        throw new AppError(
          400,
          "CHECKOUT_MISMATCH",
          "This Stripe session does not match the saved attempt.",
        );
      await sql`update checkout_attempts set session_id=${session.id},state=${session.status === "expired" ? "expired" : session.status === "complete" ? "complete" : "open"},problem=null where id=${attempt.id}`;
      if (["cancelled", "paid", "settled"].includes(invoice.status))
        await expireInvoiceSessions(sql, id);
    },
    undefined,
    true,
  );
  return { recovered: true };
}
