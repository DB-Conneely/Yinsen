import { createHash } from "node:crypto";
import type postgres from "postgres";
import { z } from "zod";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { operatorOnly, type ProjectActor } from "../projects/access";
import { resourceId } from "../projects/validation";
import { invoiceStatus } from "./validation";

export type Invoice = {
  id: string;
  clientId: string;
  projectId: string | null;
  number: string;
  status: z.infer<typeof invoiceStatus>;
  currency: string;
  amount: number;
  totalOverride: number | null;
  dueDate: string | null;
  notes: string;
  recipientName: string;
  recipientEmail: string;
  issuerName: string;
  issuerEmail: string;
  brandColour: string;
  paymentInstructions: string;
  emailFailed: boolean;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  settlementData: {
    amountReceived: number;
    paymentMethod: string;
    reference: string;
  } | null;
};
export type InvoiceDetail = Invoice & {
  revision: string;
  lineItems: {
    description: string;
    quantityHundredths: number;
    unitPrice: number;
    amount: number;
  }[];
  milestones: { id: string; name: string }[];
};
const fields = `i.id,i.client_id as "clientId",i.project_id as "projectId",i.invoice_number as number,i.status,i.currency,i.amount,i.total_override as "totalOverride",i.due_date::text as "dueDate",i.notes,i.recipient_name as "recipientName",i.recipient_email as "recipientEmail",i.issuer_name as "issuerName",i.issuer_email as "issuerEmail",i.brand_colour as "brandColour",i.payment_instructions as "paymentInstructions",i.email_failed as "emailFailed",i.sent_at::text as "sentAt",i.paid_at::text as "paidAt",i.created_at::text as "createdAt",i.settlement_data as "settlementData"`;

export async function listInvoices(
  actor: ProjectActor,
  input: unknown = {},
): Promise<Invoice[]> {
  const filter = z
    .object({
      status: invoiceStatus.optional(),
      client_id: resourceId.optional(),
      project_id: resourceId.optional(),
    })
    .strict()
    .parse(input);
  return getSql()<
    Invoice[]
  >`select ${getSql().unsafe(fields)} from invoices i where i.deleted_at is null and (${actor.role === "operator"} or (i.client_id=${actor.id} and i.sent_at is not null and exists(select 1 from clients c where c.id=i.client_id and c.deleted_at is null))) and (${filter.status ?? null}::text is null or i.status=${filter.status ?? null}) and (${filter.client_id ?? null}::uuid is null or i.client_id=${filter.client_id ?? null}) and (${filter.project_id ?? null}::uuid is null or i.project_id=${filter.project_id ?? null}) order by i.created_at desc,i.id`;
}

export async function getInvoice(
  id: string,
  actor: ProjectActor,
  sql: postgres.Sql | postgres.TransactionSql = getSql(),
  historical = false,
): Promise<InvoiceDetail> {
  resourceId.parse(id);
  if (historical) operatorOnly(actor);
  if (sql === getSql())
    return getSql().begin(async (transaction) => {
      await transaction`select i.id from invoices i where i.id=${id} and i.deleted_at is null and (${actor.role === "operator"} or (i.client_id=${actor.id} and i.sent_at is not null and exists(select 1 from clients c where c.id=i.client_id and c.deleted_at is null))) for share of i`;
      return getInvoice(id, actor, transaction, historical);
    });
  const rows = await sql<
    Invoice[]
  >`select ${sql.unsafe(fields)} from invoices i where i.id=${id} and (${historical} or i.deleted_at is null) and (${actor.role === "operator"} or (i.client_id=${actor.id} and i.sent_at is not null and exists(select 1 from clients c where c.id=i.client_id and c.deleted_at is null)))`;
  const invoice = rows[0];
  if (!invoice) throw new AppError(404, "NOT_FOUND", "Invoice not found.");
  const lineItems = await sql<
    InvoiceDetail["lineItems"]
  >`select description,quantity_hundredths as "quantityHundredths",unit_price as "unitPrice",amount from invoice_line_items where invoice_id=${id} order by position`;
  const milestones = await sql<
    InvoiceDetail["milestones"]
  >`select m.id,m.name from invoice_milestones im join milestones m on m.id=im.milestone_id where im.invoice_id=${id} order by m.position,m.id`;
  const { emailFailed: _emailFailed, ...terms } = invoice;
  const revision = createHash("sha256")
    .update(JSON.stringify([terms, lineItems, milestones]))
    .digest("hex");
  return { ...invoice, lineItems, milestones, revision };
}

export type InvoiceChoices = {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientIds: string[] }[];
  milestones: { id: string; name: string; projectId: string }[];
};
export async function invoiceChoices(
  actor: ProjectActor,
): Promise<InvoiceChoices> {
  operatorOnly(actor);
  const sql = getSql();
  const clients = await sql<
    InvoiceChoices["clients"]
  >`select id,name from clients where deleted_at is null order by name,id`;
  const projects = await sql<
    InvoiceChoices["projects"]
  >`select p.id,p.name,array(select pc.client_id::text from project_clients pc where pc.project_id=p.id) as "clientIds" from projects p where p.deleted_at is null order by p.name,p.id`;
  const milestones = await sql<
    InvoiceChoices["milestones"]
  >`select m.id,m.name,m.project_id as "projectId" from milestones m join projects p on p.id=m.project_id where p.deleted_at is null order by m.position,m.id`;
  return { clients, projects, milestones };
}
