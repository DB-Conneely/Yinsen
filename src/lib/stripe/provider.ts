import Stripe from "stripe";
import type postgres from "postgres";
import { readConfiguration } from "../config";
import { AppError } from "../errors";
import { currencyDigits } from "../money";

export function stripeClient(): Stripe {
  const config = readConfiguration().stripe;
  if (!config)
    throw new AppError(
      503,
      "STRIPE_UNAVAILABLE",
      "Online payment is unavailable. Use the invoice payment instructions.",
    );
  return new Stripe(config.key, {
    apiVersion: "2026-09-30.endive",
    maxNetworkRetries: 0,
    timeout: 10000,
  });
}

export function stripeAmount(amount: number, currency: string): number {
  const digits = currencyDigits(currency);
  // Stripe retains two API decimals for these whole-unit charge currencies.
  const value = ["ISK", "UGX"].includes(currency) ? amount * 100 : amount;
  if (
    ![0, 2].includes(digits) ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 99999999
  )
    throw new AppError(
      400,
      "STRIPE_AMOUNT_UNSUPPORTED",
      "This amount or currency cannot be collected through online card payment. Use the invoice payment instructions.",
    );
  return value;
}

export async function verifyStripe(): Promise<
  "verified" | "skipped" | "failed"
> {
  if (!readConfiguration().stripe) return "skipped";
  try {
    await stripeClient().accounts.retrieveCurrent();
    return "verified";
  } catch {
    return "failed";
  }
}

// Called inside the same invoice lock as cancellation/manual settlement.
export async function expireInvoiceSessions(
  sql: postgres.TransactionSql,
  invoiceId: string,
): Promise<void> {
  const rows = await sql<
    { id: string; sessionId: string | null }[]
  >`select id,session_id as "sessionId" from checkout_attempts where invoice_id=${invoiceId} and state in ('uncertain','open')`;
  for (const attempt of rows) {
    try {
      if (!attempt.sessionId)
        throw new AppError(
          409,
          "CHECKOUT_UNCERTAIN",
          "Checkout creation requires provider reconciliation.",
        );
      const session = await stripeClient().checkout.sessions.retrieve(
        attempt.sessionId,
      );
      if (session.status === "open")
        await stripeClient().checkout.sessions.expire(session.id);
      await sql`update checkout_attempts set state=${session.status === "complete" ? "complete" : "expired"},expiration_failed=false,problem=null where id=${attempt.id}`;
    } catch {
      await sql`update checkout_attempts set expiration_failed=true,problem='Session expiration could not be confirmed. Consult Stripe before arranging another payment.' where id=${attempt.id}`;
    }
  }
}
