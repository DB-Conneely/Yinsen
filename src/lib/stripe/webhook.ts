import Stripe from "stripe";
import type postgres from "postgres";
import { z } from "zod";
import { getSql } from "../db/client";
import { readConfiguration } from "../config";
import { AppError } from "../errors";
import {
  withInvoiceLock,
  writeMoneyReceived,
  publishInvoice,
} from "../invoices/service";
import type { InvoiceDetail } from "../invoices/queries";
import type { ProjectActor } from "../projects/access";
import {
  invoiceAttempts,
  matchesAttempt,
  type CheckoutAttempt,
} from "./checkout";
import { stripeClient } from "./provider";

type SessionEvent =
  | Stripe.CheckoutSessionCompletedEvent
  | Stripe.CheckoutSessionAsyncPaymentSucceededEvent
  | Stripe.CheckoutSessionAsyncPaymentFailedEvent
  | Stripe.CheckoutSessionExpiredEvent;
function supported(event: Stripe.Event): event is SessionEvent {
  return [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
  ].includes(event.type);
}

async function recordPayment(
  sql: postgres.TransactionSql,
  event: SessionEvent,
  attempt: CheckoutAttempt,
  invoice: InvoiceDetail,
  actor: ProjectActor,
): Promise<void> {
  const session = event.data.object;
  const payment =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!payment)
    throw new AppError(
      400,
      "INVALID_PAYMENT",
      "Paid Checkout has no payment reference.",
    );
  const match =
    matchesAttempt(session, attempt) &&
    (!attempt.sessionId || attempt.sessionId === session.id) &&
    attempt.amount === invoice.amount &&
    attempt.currency === invoice.currency;
  const exception = !match
    ? "Provider payment does not match the frozen invoice/Checkout correlation."
    : !["sent", "overdue"].includes(invoice.status)
      ? `Additional payment received for ${invoice.status} invoice. Consult Stripe and resolve outside Yinsen.`
      : null;
  const inserted =
    await sql`insert into stripe_payments(payment_id,attempt_id,event_id,session_id,amount,currency,exception) values(${payment},${attempt.id},${event.id},${session.id},${session.amount_total ?? 0},${session.currency ?? "unknown"},${exception}) on conflict(payment_id) do nothing returning payment_id`;
  if (!inserted.length) return;
  if (!exception)
    await writeMoneyReceived(
      sql,
      invoice,
      {
        status: "paid",
        amount: invoice.amount,
        currency: invoice.currency,
        reference: payment,
        paymentMethod: "stripe",
      },
      actor,
    );
  await sql`update stripe_events set outcome=${exception ? "exception" : "paid"} where id=${event.id}`;
}

async function applyEvent(
  sql: postgres.TransactionSql,
  event: SessionEvent,
  attempt: CheckoutAttempt,
  invoice: InvoiceDetail,
  actor: ProjectActor,
): Promise<void> {
  const inserted =
    await sql`insert into stripe_events(id,type,attempt_id,outcome) values(${event.id},${event.type},${attempt.id},'ignored') on conflict(id) do nothing returning id`;
  if (!inserted.length) return;
  const session = event.data.object;
  if (
    session.payment_status === "paid" &&
    session.status === "complete" &&
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  ) {
    await recordPayment(sql, event, attempt, invoice, actor);
    if (
      matchesAttempt(session, attempt) &&
      (!attempt.sessionId || attempt.sessionId === session.id)
    )
      await sql`update checkout_attempts set session_id=${session.id},state='complete',problem=null,expiration_failed=false where id=${attempt.id}`;
  } else if (
    matchesAttempt(session, attempt) &&
    (!attempt.sessionId || attempt.sessionId === session.id) &&
    !(await sql`select 1 from stripe_payments where attempt_id=${attempt.id}`)
      .length
  ) {
    const state =
      event.type === "checkout.session.expired"
        ? "expired"
        : event.type === "checkout.session.async_payment_failed"
          ? "failed"
          : "complete";
    if (state === "complete" && ["failed", "expired"].includes(attempt.state))
      return;
    await sql`update checkout_attempts set session_id=${session.id},state=${state},problem=${state === "failed" ? "Stripe reports that this payment failed. No payment was recorded." : null},expiration_failed=false where id=${attempt.id}`;
    await sql`update stripe_events set outcome=${state === "complete" ? "unpaid" : state} where id=${event.id}`;
  }
}

export async function handleStripeWebhook(
  raw: string,
  signature: string,
): Promise<{ received: true }> {
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      raw,
      signature,
      readConfiguration().stripe?.webhookSecret ?? "",
    );
  } catch {
    throw new AppError(400, "INVALID_SIGNATURE", "Invalid Stripe signature.");
  }
  if (!supported(event)) return { received: true };
  const attemptId = z.uuid().safeParse(event.data.object.metadata?.attempt_id);
  if (!attemptId.success) return { received: true };
  const rows = await getSql()<
    { invoiceId: string }[]
  >`select invoice_id as "invoiceId" from checkout_attempts where id=${attemptId.data}`;
  const invoiceId = rows[0]?.invoiceId;
  if (!invoiceId) return { received: true };
  const operators = await getSql()<{ id: string }[]>`select id from operator`;
  const operator = operators[0];
  if (!operator)
    throw new AppError(
      503,
      "SETUP_REQUIRED",
      "Payment processing requires completed setup.",
    );
  const actor: ProjectActor = { id: operator.id, role: "operator" };
  const invoice = await withInvoiceLock(
    invoiceId,
    actor,
    async (sql, current) => {
      const attempt = (await invoiceAttempts(sql, invoiceId)).find(
        (value) => value.id === attemptId.data,
      );
      if (!attempt)
        throw new AppError(
          503,
          "CHECKOUT_UNAVAILABLE",
          "Checkout correlation is unavailable.",
        );
      await applyEvent(sql, event, attempt, current, actor);
      return current;
    },
    undefined,
    true,
  );
  await publishInvoice(invoice);
  return { received: true };
}
