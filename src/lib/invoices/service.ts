import type postgres from "postgres";
import { z } from "zod";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { readConfiguration } from "../config";
import {
  operatorOnly,
  lockProject,
  type ProjectActor,
} from "../projects/access";
import { projectMemberIds } from "../projects/service";
import { resourceId, reviewedVersion } from "../projects/validation";
import { publishProject, publishClientAccess } from "../events/hub";
import { writeDeliverableRelease } from "../deliverables/service";
import { sendInvoiceEmail } from "../email/resend";
import { getInvoice, type InvoiceDetail } from "./queries";
import {
  invoiceFields,
  invoiceTotals,
  invoiceDefaults,
  settlementInput,
} from "./validation";

type Fields = z.infer<typeof invoiceFields>;

// All invoice writers use this boundary. Project locks precede the invoice row lock.
export async function withInvoiceLock(
  id: string,
  actor: ProjectActor,
  action: (
    sql: postgres.TransactionSql,
    invoice: InvoiceDetail,
  ) => Promise<InvoiceDetail>,
  nextProjectId?: string | null,
): Promise<InvoiceDetail> {
  resourceId.parse(id);
  return getSql().begin(async (sql) => {
    const visible =
      await sql`select i.id from invoices i where i.id=${id} and i.deleted_at is null and (${actor.role === "operator"} or (i.client_id=${actor.id} and i.sent_at is not null and exists(select 1 from clients c where c.id=i.client_id and c.deleted_at is null)))`;
    if (!visible.length)
      throw new AppError(404, "NOT_FOUND", "Invoice not found.");
    await sql`select pg_advisory_xact_lock(hashtextextended(${id},32))`;
    const rows = await sql<
      { projectId: string | null }[]
    >`select project_id as "projectId" from invoices where id=${id}`;
    const projectIds = [
      ...new Set(
        [rows[0]?.projectId, nextProjectId].filter((value): value is string =>
          Boolean(value),
        ),
      ),
    ].sort();
    for (const projectId of projectIds)
      await sql`select id from projects where id=${projectId} for update`;
    await sql`select id from invoices where id=${id} for update`;
    return action(sql, await getInvoice(id, actor, sql));
  });
}

export async function publishInvoice(invoice: InvoiceDetail): Promise<void> {
  publishClientAccess(invoice.clientId);
  if (invoice.projectId)
    publishProject(
      invoice.projectId,
      await projectMemberIds(getSql(), invoice.projectId),
    );
}

async function activity(
  sql: postgres.TransactionSql,
  invoice: InvoiceDetail,
  actor: ProjectActor,
  event: string,
): Promise<void> {
  await sql`insert into activity_events(client_id,actor_type,actor_id,event_type) values(${invoice.clientId},${actor.role},${actor.id},${event})`;
}

async function validateRelationship(
  sql: postgres.TransactionSql,
  fields: Fields,
): Promise<{ name: string; email: string }> {
  const rows = await sql<
    { name: string; email: string }[]
  >`select name,email from clients where id=${fields.clientId} and deleted_at is null for update`;
  if (!rows[0])
    throw new AppError(
      400,
      "INVALID_RECIPIENT",
      "Choose an active invoice recipient.",
    );
  if (fields.projectId) {
    const member =
      await sql`select 1 from project_clients pc join projects p on p.id=pc.project_id where pc.project_id=${fields.projectId} and pc.client_id=${fields.clientId} and p.deleted_at is null`;
    if (!member.length)
      throw new AppError(
        400,
        "INVALID_ASSOCIATION",
        "The project must belong to the invoice recipient.",
      );
  }
  if (fields.milestoneIds.length) {
    const links =
      await sql`select id from milestones where id in ${sql(fields.milestoneIds)} and project_id=${fields.projectId}`;
    if (!fields.projectId || links.length !== fields.milestoneIds.length)
      throw new AppError(
        400,
        "INVALID_ASSOCIATION",
        "Every linked milestone must belong to the selected project.",
      );
  }
  return rows[0];
}

async function replaceItems(
  sql: postgres.TransactionSql,
  id: string,
  fields: Fields,
): Promise<void> {
  await sql`delete from invoice_line_items where invoice_id=${id}`;
  await sql`delete from invoice_milestones where invoice_id=${id}`;
  for (const [position, item] of invoiceTotals(fields).items.entries())
    await sql`insert into invoice_line_items(invoice_id,description,quantity_hundredths,unit_price,amount,position) values(${id},${item.description},${item.quantityHundredths},${item.unitPrice},${item.amount},${position})`;
  for (const milestoneId of fields.milestoneIds)
    await sql`insert into invoice_milestones(invoice_id,milestone_id) values(${id},${milestoneId})`;
}

async function writeFields(
  sql: postgres.TransactionSql,
  id: string,
  fields: Fields,
): Promise<void> {
  const recipient = await validateRelationship(sql, fields);
  await sql`update invoices set client_id=${fields.clientId},project_id=${fields.projectId},currency=${fields.currency},amount=${invoiceTotals(fields).amount},total_override=${fields.totalOverride},due_date=${fields.dueDate},notes=${fields.notes},recipient_name=${recipient.name},recipient_email=${recipient.email},updated_at=clock_timestamp(),email_failed=false where id=${id}`;
  await replaceItems(sql, id, fields);
}

export async function createInvoice(
  input: unknown,
  actor: ProjectActor,
): Promise<InvoiceDetail> {
  operatorOnly(actor);
  const { requestId, ...fields } = invoiceFields
    .extend({ requestId: resourceId })
    .parse(input);
  const result = await getSql().begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${requestId},32))`;
    const existing = await sql`select id from invoices where id=${requestId}`;
    if (existing.length) {
      const saved = await getInvoice(requestId, actor, sql);
      if (
        saved.clientId !== fields.clientId ||
        saved.projectId !== fields.projectId ||
        saved.currency !== fields.currency ||
        saved.totalOverride !== fields.totalOverride ||
        saved.dueDate !== fields.dueDate ||
        saved.notes !== fields.notes ||
        JSON.stringify(saved.lineItems) !==
          JSON.stringify(invoiceTotals(fields).items) ||
        JSON.stringify(saved.milestones.map((item) => item.id).sort()) !==
          JSON.stringify([...fields.milestoneIds].sort())
      )
        throw new AppError(
          409,
          "INVOICE_REQUEST_CHANGED",
          "This draft request was already saved with different terms. Open the saved invoice before editing it.",
        );
      return saved;
    }
    if (fields.projectId) await lockProject(sql, fields.projectId, actor);
    const recipient = await validateRelationship(sql, fields);
    const defaults = await sql<
      {
        prefix: string;
        sequence: number;
        name: string;
        email: string;
        colour: string;
        instructions: string;
      }[]
    >`update settings set invoice_next_number=invoice_next_number+1 where invoice_next_number<2147483647 returning invoice_prefix as prefix,invoice_next_number-1 as sequence,brand_name as name,(select email from operator) as email,brand_colour as colour,payment_instructions as instructions`;
    const settings = defaults[0];
    if (!settings)
      throw new AppError(
        409,
        "NUMBER_UNAVAILABLE",
        "Invoice counter exhausted. Update invoice defaults.",
      );
    const number = `${settings.prefix}-${String(settings.sequence).padStart(3, "0")}`;
    await sql`insert into invoices(id,client_id,project_id,invoice_number,prefix,sequence,currency,amount,total_override,due_date,notes,recipient_name,recipient_email,issuer_name,issuer_email,brand_colour,payment_instructions) values(${requestId},${fields.clientId},${fields.projectId},${number},${settings.prefix},${settings.sequence},${fields.currency},${invoiceTotals(fields).amount},${fields.totalOverride},${fields.dueDate},${fields.notes},${recipient.name},${recipient.email},${settings.name},${settings.email},${settings.colour},${settings.instructions})`;
    await replaceItems(sql, requestId, fields);
    const invoice = await getInvoice(requestId, actor, sql);
    await activity(sql, invoice, actor, "invoice.created");
    return invoice;
  });
  await publishInvoice(result);
  return result;
}

function draftOnly(invoice: InvoiceDetail): void {
  if (invoice.status !== "draft")
    throw new AppError(
      409,
      "INVOICE_FROZEN",
      "Issued invoices are frozen. Cancel and create a new invoice to change financial terms.",
    );
}
function checkRevision(invoice: InvoiceDetail, expected: string): void {
  if (invoice.revision !== expected)
    throw new AppError(
      409,
      "INVOICE_CHANGED",
      "This invoice changed. Your draft is kept; review the saved invoice before retrying.",
    );
}

export async function updateInvoice(
  id: string,
  input: unknown,
  actor: ProjectActor,
): Promise<InvoiceDetail> {
  operatorOnly(actor);
  const { expectedRevision, ...fields } = invoiceFields
    .extend(reviewedVersion.shape)
    .parse(input);
  const invoice = await withInvoiceLock(
    id,
    actor,
    async (sql, current) => {
      draftOnly(current);
      checkRevision(current, expectedRevision);
      await writeFields(sql, id, fields);
      const saved = await getInvoice(id, actor, sql);
      await activity(sql, saved, actor, "invoice.updated");
      return saved;
    },
    fields.projectId,
  );
  await publishInvoice(invoice);
  return invoice;
}

export async function sendInvoice(
  id: string,
  input: unknown,
  actor: ProjectActor,
): Promise<InvoiceDetail> {
  operatorOnly(actor);
  const { expectedRevision } = reviewedVersion.parse(input);
  let providerFailed = false;
  try {
    const result = await withInvoiceLock(id, actor, async (sql, invoice) => {
      draftOnly(invoice);
      checkRevision(invoice, expectedRevision);
      const recipient = await validateRelationship(sql, {
        clientId: invoice.clientId,
        projectId: invoice.projectId,
        milestoneIds: invoice.milestones.map((item) => item.id),
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        notes: invoice.notes,
        totalOverride: invoice.totalOverride,
        lineItems: invoice.lineItems.map((item) => ({
          description: item.description,
          quantity: String(item.quantityHundredths / 100),
          unitPrice: item.unitPrice,
        })),
      });
      const issuers = await sql<
        { name: string; email: string; colour: string; instructions: string }[]
      >`select s.brand_name as name,o.email,s.brand_colour as colour,s.payment_instructions as instructions from settings s join operator o on o.singleton=s.singleton`;
      const issuer = issuers[0];
      if (!issuer)
        throw new AppError(
          503,
          "SETUP_REQUIRED",
          "Complete installation setup first.",
        );
      await sql`update invoices set recipient_name=${recipient.name},recipient_email=${recipient.email},issuer_name=${issuer.name},issuer_email=${issuer.email},brand_colour=${issuer.colour},payment_instructions=${issuer.instructions} where id=${id}`;
      const issued = await getInvoice(id, actor, sql);
      const emailId = readConfiguration().email
        ? await sendInvoiceEmail({
            invoice: issued,
            url: `${readConfiguration().origin}/portal/invoices/${id}`,
          }).catch((error: unknown) => {
            providerFailed = true;
            throw error;
          })
        : null;
      await sql`update invoices set status='sent',sent_at=now(),email_id=${emailId},email_failed=false,updated_at=clock_timestamp() where id=${id}`;
      await activity(sql, invoice, actor, "invoice.sent");
      return getInvoice(id, actor, sql);
    });
    await publishInvoice(result);
    return result;
  } catch (error: unknown) {
    if (providerFailed)
      await getSql()`update invoices set email_failed=true where id=${id} and status='draft'`;
    throw error;
  }
}

// Caller holds withInvoiceLock. Only sent/overdue can receive money; terminal replay never releases again.
export async function writeMoneyReceived(
  sql: postgres.TransactionSql,
  invoice: InvoiceDetail,
  receipt: {
    status: "paid" | "settled";
    amount: number;
    currency: string;
    reference: string;
    paymentMethod: string;
  },
  actor: ProjectActor,
): Promise<InvoiceDetail> {
  if (
    receipt.amount !== invoice.amount ||
    receipt.currency !== invoice.currency
  )
    throw new AppError(
      400,
      "AMOUNT_MISMATCH",
      "Record the exact full invoice amount and currency. Partial or excess payments cannot settle this invoice.",
    );
  if (invoice.status === "paid" || invoice.status === "settled") return invoice;
  if (invoice.status !== "sent" && invoice.status !== "overdue")
    throw new AppError(
      409,
      "NOT_PAYABLE",
      "Only a sent or overdue invoice can receive payment.",
    );
  const settlement =
    receipt.status === "settled"
      ? JSON.stringify({
          amountReceived: receipt.amount,
          paymentMethod: receipt.paymentMethod,
          reference: receipt.reference,
        })
      : null;
  await sql`update invoices set status=${receipt.status},paid_at=now(),settlement_data=${settlement}::jsonb,updated_at=clock_timestamp() where id=${invoice.id}`;
  if (invoice.projectId) {
    const files = await sql<
      { id: string }[]
    >`select d.id from deliverables d join invoice_milestones im on im.milestone_id=d.milestone_id where im.invoice_id=${invoice.id} order by d.id`;
    for (const file of files)
      await writeDeliverableRelease(
        sql,
        invoice.projectId,
        file.id,
        true,
        actor,
      );
  }
  await activity(sql, invoice, actor, `invoice.${receipt.status}`);
  return getInvoice(invoice.id, actor, sql);
}

export async function settleInvoice(
  id: string,
  input: unknown,
  actor: ProjectActor,
): Promise<InvoiceDetail> {
  operatorOnly(actor);
  const receipt = settlementInput.parse(input);
  const invoice = await withInvoiceLock(id, actor, (sql, current) =>
    writeMoneyReceived(
      sql,
      current,
      {
        status: "settled",
        amount: receipt.amountReceived,
        currency: current.currency,
        reference: receipt.reference,
        paymentMethod: receipt.paymentMethod,
      },
      actor,
    ),
  );
  await publishInvoice(invoice);
  return invoice;
}

export async function cancelInvoice(
  id: string,
  actor: ProjectActor,
  remove = false,
): Promise<{ cancelled: true }> {
  operatorOnly(actor);
  const invoice = await withInvoiceLock(id, actor, async (sql, current) => {
    if (current.status === "paid" || current.status === "settled")
      throw new AppError(
        409,
        "MONEY_RECEIVED",
        "Paid and settled invoices cannot be cancelled or deleted.",
      );
    if (current.status !== "cancelled") {
      await sql`update invoices set status='cancelled',updated_at=clock_timestamp() where id=${id}`;
      await activity(sql, current, actor, "invoice.cancelled");
    }
    if (remove) await sql`update invoices set deleted_at=now() where id=${id}`;
    return current;
  });
  await publishInvoice(invoice);
  return { cancelled: true };
}

export async function saveInvoiceDefaults(
  input: unknown,
  actor: ProjectActor,
): Promise<{ saved: true }> {
  operatorOnly(actor);
  const fields = invoiceDefaults.parse(input);
  await getSql().begin(async (sql) => {
    await sql`select singleton from settings for update`;
    const used =
      await sql`select 1 from invoices where prefix=${fields.invoicePrefix} and sequence>=${fields.invoiceNextNumber} limit 1`;
    if (used.length)
      throw new AppError(
        409,
        "NUMBER_REUSE",
        "This prefix has already used that number or a later number. Choose a larger counter.",
      );
    await sql`update settings set invoice_prefix=${fields.invoicePrefix},invoice_next_number=${fields.invoiceNextNumber},payment_instructions=${fields.paymentInstructions}`;
  });
  return { saved: true };
}
