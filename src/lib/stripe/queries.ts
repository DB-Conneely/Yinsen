import { z } from "zod";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { operatorOnly, type ProjectActor } from "../projects/access";
import { withInvoiceLock } from "../invoices/service";
import { publishClientAccess } from "../events/hub";

export type PaymentException = {
  invoiceId: string;
  number: string;
  paymentId: string;
  sessionId: string;
  exception: string;
  resolution: string | null;
  amount: number;
  currency: string;
};
export type CheckoutProblem = {
  invoiceId: string;
  number: string;
  id: string;
  sessionId: string | null;
  problem: string | null;
};
export async function checkoutProblems(
  actor: ProjectActor,
): Promise<CheckoutProblem[]> {
  operatorOnly(actor);
  return getSql()<
    CheckoutProblem[]
  >`select a.invoice_id as "invoiceId",i.invoice_number as number,a.id,a.session_id as "sessionId",a.problem from checkout_attempts a join invoices i on i.id=a.invoice_id where (a.state in ('uncertain','open','complete') and a.problem is not null) or a.expiration_failed order by a.created_at desc,a.id`;
}

export async function paymentExceptions(
  actor: ProjectActor,
): Promise<PaymentException[]> {
  operatorOnly(actor);
  return getSql()<
    PaymentException[]
  >`select a.invoice_id as "invoiceId",i.invoice_number as number,p.payment_id as "paymentId",p.session_id as "sessionId",p.exception,p.resolution,p.amount::float8 as amount,p.currency from stripe_payments p join checkout_attempts a on a.id=p.attempt_id join invoices i on i.id=a.invoice_id where p.exception is not null order by p.created_at desc,p.payment_id`;
}

export async function resolvePaymentException(
  id: string,
  input: unknown,
  actor: ProjectActor,
): Promise<{ saved: true }> {
  operatorOnly(actor);
  const { paymentId, resolution } = z
    .object({
      paymentId: z.string().regex(/^pi_[A-Za-z0-9]+$/),
      resolution: z.string().trim().min(5).max(1000),
    })
    .strict()
    .parse(input);
  const clientId = await withInvoiceLock(
    id,
    actor,
    async (sql, invoice) => {
      const rows =
        await sql`update stripe_payments p set resolution=${resolution},resolved_at=now() from checkout_attempts a where p.attempt_id=a.id and a.invoice_id=${id} and p.payment_id=${paymentId} and p.exception is not null returning p.payment_id`;
      if (!rows.length)
        throw new AppError(404, "NOT_FOUND", "Payment exception not found.");
      return invoice.clientId;
    },
    undefined,
    true,
  );
  publishClientAccess(clientId);
  return { saved: true };
}
