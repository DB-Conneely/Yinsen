import type postgres from "postgres";
import { getSql } from "../db/client";
import { projectAccess, type ProjectActor } from "../projects/access";
import { resourceId } from "../projects/validation";
import { AppError } from "../errors";

export type Conversation = { kind: "client" | "project"; id: string };

export async function conversationAccess(
  conversation: Conversation,
  actor: ProjectActor,
  sql: postgres.Sql | postgres.TransactionSql = getSql(),
  lock: "share" | "update" = "share",
): Promise<void> {
  const id = resourceId.parse(conversation.id);
  if (conversation.kind === "project") {
    if (lock === "update")
      await sql`select id from projects where id=${id} for update`;
    else await sql`select id from projects where id=${id} for share`;
    await projectAccess(id, actor, sql);
    if (actor.role === "client") {
      // Match archive/session-revocation's client lock while this conversation operation runs.
      const active =
        await sql`select id from clients where id=${actor.id} and deleted_at is null for share`;
      if (!active.length)
        throw new AppError(404, "NOT_FOUND", "Project not found.");
    }
  } else {
    const rows =
      lock === "update"
        ? await sql`select id from clients where id=${id} and deleted_at is null and (${actor.role === "operator"} or id=${actor.id}) for update`
        : await sql`select id from clients where id=${id} and deleted_at is null and (${actor.role === "operator"} or id=${actor.id}) for share`;
    if (!rows.length)
      throw new AppError(404, "NOT_FOUND", "Conversation not found.");
  }
}
