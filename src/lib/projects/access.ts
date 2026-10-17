import type postgres from "postgres";
import { validateClientSession } from "../auth/client";
import { validateOperatorSession } from "../auth/session";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { resourceId } from "./validation";

export type ProjectActor = { id: string; role: "operator" | "client" };

export async function projectActor(
  token: string | undefined,
): Promise<ProjectActor> {
  const actor =
    (await validateOperatorSession(token)) ??
    (await validateClientSession(token));
  if (!actor)
    throw new AppError(401, "UNAUTHORIZED", "Please log in to continue.");
  return actor;
}

export function operatorOnly(actor: ProjectActor): void {
  if (actor.role !== "operator")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the operator can manage this work.",
    );
}

export async function projectAccess(
  id: string,
  actor: ProjectActor,
  sql: postgres.Sql | postgres.TransactionSql = getSql(),
): Promise<void> {
  const rows =
    await sql`select p.id from projects p where p.id=${resourceId.parse(id)} and p.deleted_at is null and (${actor.role === "operator"} or exists (select 1 from project_clients pc join clients c on c.id=pc.client_id where pc.project_id=p.id and pc.client_id=${actor.id} and c.deleted_at is null))`;
  if (!rows.length) throw new AppError(404, "NOT_FOUND", "Project not found.");
}

export async function lockProject(
  sql: postgres.TransactionSql,
  id: string,
  actor: ProjectActor,
): Promise<void> {
  await sql`select id from projects where id=${resourceId.parse(id)} for update`;
  await projectAccess(id, actor, sql);
}
