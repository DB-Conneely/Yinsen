import { getSql } from "../db/client";
import { logger } from "../logger";
import { AppError } from "../errors";
import { withInvoiceLock, publishInvoice } from "./service";

export async function markOverdueInvoices(): Promise<void> {
  const operators = await getSql()<{ id: string }[]>`select id from operator`;
  const operator = operators[0];
  if (!operator) return;
  const actor = { id: operator.id, role: "operator" as const };
  const candidates = await getSql()<
    { id: string }[]
  >`select id from invoices where status='sent' and deleted_at is null and due_date<current_date order by id`;
  for (const candidate of candidates) {
    try {
      const invoice = await withInvoiceLock(
        candidate.id,
        actor,
        async (sql, current) => {
          const changed =
            await sql`update invoices set status='overdue',updated_at=clock_timestamp() where id=${current.id} and status='sent' and due_date<current_date returning id`;
          if (changed.length)
            await sql`insert into activity_events(client_id,actor_type,actor_id,event_type) values(${current.clientId},'operator',${operator.id},'invoice.overdue')`;
          return current;
        },
      );
      await publishInvoice(invoice);
    } catch (error: unknown) {
      // A candidate can be deleted after the scan; unrelated invoices still need this pass.
      if (!(error instanceof AppError && error.statusCode === 404)) throw error;
    }
  }
  logger.info(
    { event: "invoices.overdue_checked", candidates: candidates.length },
    "Overdue invoices checked",
  );
}
