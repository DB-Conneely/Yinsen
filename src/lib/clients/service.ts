import { z } from "zod";
import type postgres from "postgres";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { emailSchema } from "../auth/validation";

export const clientInput = z
  .object({
    name: z.string().trim().min(1).max(255),
    email: emailSchema,
    company: z.string().trim().max(255).default(""),
    phone: z.string().trim().max(50).default(""),
    notes: z.string().trim().max(3000).default(""),
    metadata: z
      .record(z.string().trim().min(1).max(50), z.string().max(500))
      .refine(
        (value) => Object.keys(value).length <= 20,
        "Use at most 20 custom fields.",
      )
      .default({}),
  })
  .strict();
export const clientId = z.uuid();
const filtersSchema = z
  .object({
    search: z.string().trim().max(255).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    include_deleted: z.enum(["true", "false"]).default("false"),
    sort: z.enum(["name", "newest"]).default("name"),
  })
  .strict();
export type Client = z.infer<typeof clientInput> & {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
type ClientRow = Omit<Client, "metadata"> & { metadata: string };
function readClient(row: ClientRow): Client {
  return {
    ...row,
    metadata: clientInput.shape.metadata.parse(
      JSON.parse(row.metadata) as unknown,
    ),
  };
}

export async function lockClient(
  sql: postgres.TransactionSql,
  id: string,
): Promise<void> {
  const rows =
    await sql`select id from clients where id = ${clientId.parse(id)} for update`;
  if (!rows.length) throw new AppError(404, "NOT_FOUND", "Client not found.");
}

export async function recordActivity(
  sql: postgres.Sql | postgres.TransactionSql,
  id: string,
  actor: { id: string; role: "operator" | "client" },
  event: string,
): Promise<void> {
  await sql`insert into activity_events (client_id, actor_type, actor_id, event_type) values (${id}, ${actor.role}, ${actor.id}, ${event})`;
}

export async function getClient(
  id: string,
  sql: postgres.Sql | postgres.TransactionSql = getSql(),
): Promise<Client> {
  const rows = await sql<
    ClientRow[]
  >`select id, name, email, company, phone, notes, metadata::text as metadata, created_at::text as "createdAt", updated_at::text as "updatedAt", deleted_at::text as "deletedAt" from clients where id = ${clientId.parse(id)}`;
  if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Client not found.");
  return readClient(rows[0]);
}

export async function listClients(
  input: unknown,
): Promise<{ clients: Client[]; total: number; page: number; pages: number }> {
  const filters = filtersSchema.parse(input);
  const sql = getSql();
  const search = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = sql`(${filters.include_deleted === "true"} or deleted_at is null) and (name ilike ${search} or email ilike ${search} or company ilike ${search})`;
  const rows = await sql<
    ClientRow[]
  >`select id, name, email, company, phone, notes, metadata::text as metadata, created_at::text as "createdAt", updated_at::text as "updatedAt", deleted_at::text as "deletedAt" from clients where ${where} order by ${filters.sort === "name" ? sql`lower(name), id` : sql`created_at desc, id`} limit 10 offset ${(filters.page - 1) * 10}`;
  const count = await sql<
    { total: number }[]
  >`select count(*)::int as total from clients where ${where}`;
  const total = count[0]?.total ?? 0;
  return {
    clients: rows.map(readClient),
    total,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / 10)),
  };
}

export async function saveClient(
  input: unknown,
  actor: { id: string; role: "operator" },
  id?: string,
): Promise<Client> {
  const data = (id ? clientInput.partial() : clientInput).parse(input);
  try {
    return await getSql().begin(async (sql) => {
      if (id) await lockClient(sql, id);
      const current = id ? await getClient(id, sql) : undefined;
      if (current?.deletedAt)
        throw new AppError(
          409,
          "CLIENT_ARCHIVED",
          "Restore this client before editing.",
        );
      const fields = { ...current, ...data };
      const parsed = clientInput.parse(
        fields && {
          name: fields.name,
          email: fields.email,
          company: fields.company,
          phone: fields.phone,
          notes: fields.notes,
          metadata: fields.metadata,
        },
      );
      const rows = id
        ? await sql<
            { id: string }[]
          >`update clients set name=${parsed.name}, email=${parsed.email}, company=${parsed.company}, phone=${parsed.phone}, notes=${parsed.notes}, metadata=${JSON.stringify(parsed.metadata)}::jsonb, updated_at=now() where id=${id} returning id`
        : await sql<
            { id: string }[]
          >`insert into clients (name,email,company,phone,notes,metadata) values (${parsed.name},${parsed.email},${parsed.company},${parsed.phone},${parsed.notes},${JSON.stringify(parsed.metadata)}::jsonb) returning id`;
      const saved = rows[0];
      if (!saved)
        throw new AppError(503, "SAVE_FAILED", "Unable to save client.");
      await recordActivity(
        sql,
        saved.id,
        actor,
        id ? "client.updated" : "client.created",
      );
      return getClient(saved.id, sql);
    });
  } catch (error: unknown) {
    // Next's separate server bundles can contain distinct PostgresError classes.
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "23505" &&
      "constraint_name" in error &&
      error.constraint_name === "clients_email_unique"
    )
      throw new AppError(
        409,
        "EMAIL_EXISTS",
        "This email belongs to an existing client, including archived clients. Find and restore that client.",
      );
    throw error;
  }
}

export async function archiveClient(
  id: string,
  actor: { id: string; role: "operator" },
  restore: boolean,
): Promise<Client> {
  return getSql().begin(async (sql) => {
    await lockClient(sql, id);
    const current = await getClient(id, sql);
    if (Boolean(current.deletedAt) === !restore) return current;
    await sql`update clients set deleted_at=${restore ? null : new Date().toISOString()}, updated_at=now() where id=${id}`;
    if (!restore) {
      await sql`delete from client_sessions where client_id=${id}`;
      await sql`delete from magic_link_tokens where client_id=${id}`;
    }
    await recordActivity(
      sql,
      id,
      actor,
      restore ? "client.restored" : "client.archived",
    );
    return getClient(id, sql);
  });
}

export async function clientActivity(
  id: string,
): Promise<
  { id: string; eventType: string; actorType: string; createdAt: string }[]
> {
  return getSql()`select id, event_type as "eventType", actor_type as "actorType", created_at::text as "createdAt" from activity_events where client_id=${clientId.parse(id)} order by created_at desc, id desc limit 50`;
}
