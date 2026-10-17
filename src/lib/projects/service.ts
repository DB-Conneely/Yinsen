import type postgres from "postgres";
import { z } from "zod";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { publishProject } from "../events/hub";
import { lockProject, operatorOnly, type ProjectActor } from "./access";
import { getProject, type ProjectDetail } from "./queries";
import {
  projectFields,
  projectPatch,
  projectStatus,
  resourceId,
} from "./validation";

type Fields = z.infer<typeof projectFields>;

export async function projectMemberIds(
  sql: postgres.Sql | postgres.TransactionSql,
  id: string,
): Promise<string[]> {
  const rows = await sql<
    { id: string }[]
  >`select client_id as id from project_clients where project_id=${id}`;
  return rows.map((row) => row.id);
}

export async function projectActivity(
  sql: postgres.TransactionSql,
  id: string,
  actor: ProjectActor,
  event: string,
): Promise<void> {
  await sql`insert into project_activity (project_id,actor_id,actor_type,event_type) values (${id},${actor.id},${actor.role},${event})`;
  await sql`update projects set updated_at=clock_timestamp() where id=${id}`;
}

async function validateMembers(
  sql: postgres.TransactionSql,
  fields: Fields,
): Promise<void> {
  if (fields.startDate && fields.dueDate && fields.dueDate < fields.startDate)
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "The due date must be on or after the start date.",
    );
  // Consistent client lock order also serializes membership changes with archive.
  const rows =
    await sql`select id from clients where id in ${sql([...fields.clientIds].sort())} and deleted_at is null order by id for update`;
  if (rows.length !== fields.clientIds.length)
    throw new AppError(
      400,
      "INVALID_MEMBERS",
      "Choose active clients for every project member.",
    );
}

async function writeFields(
  sql: postgres.TransactionSql,
  fields: Fields,
  id?: string,
): Promise<string> {
  const rows = id
    ? await sql<
        { id: string }[]
      >`update projects set name=${fields.name},description=${fields.description},budget=${fields.budget},currency=${fields.currency},start_date=${fields.startDate},due_date=${fields.dueDate} where id=${id} returning id`
    : await sql<
        { id: string }[]
      >`insert into projects(name,description,budget,currency,start_date,due_date) values (${fields.name},${fields.description},${fields.budget},${fields.currency},${fields.startDate},${fields.dueDate}) returning id`;
  const savedId = rows[0]?.id;
  if (!savedId)
    throw new AppError(503, "SAVE_FAILED", "Unable to save project.");
  await sql`delete from project_clients where project_id=${savedId}`;
  for (const [position, clientId] of fields.clientIds.entries())
    await sql`insert into project_clients(project_id,client_id,role) values (${savedId},${clientId},${position === 0 ? "primary" : "member"})`;
  return savedId;
}

export async function saveProject(
  input: unknown,
  actor: ProjectActor,
  id?: string,
): Promise<ProjectDetail> {
  operatorOnly(actor);
  const patch = (id ? projectPatch : projectFields).parse(input);
  const result = await getSql().begin(async (sql) => {
    if (id) await lockProject(sql, resourceId.parse(id), actor);
    const current = id ? await getProject(id, actor, sql) : undefined;
    const fields = projectFields.parse(
      current
        ? {
            name: current.name,
            description: current.description,
            budget: current.budget,
            currency: current.currency,
            startDate: current.startDate,
            dueDate: current.dueDate,
            clientIds: current.members
              .sort(
                (a, b) =>
                  Number(b.role === "primary") - Number(a.role === "primary"),
              )
              .map((m) => m.id),
            ...patch,
          }
        : patch,
    );
    await validateMembers(sql, fields);
    const savedId = await writeFields(sql, fields, id);
    await projectActivity(
      sql,
      savedId,
      actor,
      id ? "project.updated" : "project.created",
    );
    return {
      project: await getProject(savedId, actor, sql),
      affected: [
        ...(current?.members.map((m) => m.id) ?? []),
        ...fields.clientIds,
      ],
    };
  });
  publishProject(result.project.id, result.affected);
  return result.project;
}

export async function transitionProject(
  id: string,
  input: unknown,
  actor: ProjectActor,
): Promise<ProjectDetail> {
  const next = z.object({ status: projectStatus }).strict().parse(input).status;
  const result = await getSql().begin(async (sql) => {
    await lockProject(sql, id, actor);
    const current = await getProject(id, actor, sql);
    const allowed =
      actor.role === "client"
        ? current.status === "pending_lockin" && next === "active"
        : (current.status === "draft" && next === "pending_lockin") ||
          (current.status === "active" && next === "paused") ||
          (current.status === "paused" && next === "active");
    if (!allowed)
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        "This project has changed or the requested transition is not allowed. Refresh and review its current state.",
      );
    await sql`update projects set status=${next} where id=${id}`;
    await projectActivity(
      sql,
      id,
      actor,
      actor.role === "client" ? "project.locked_in" : `project.${next}`,
    );
    return getProject(id, actor, sql);
  });
  publishProject(
    id,
    result.members.map((member) => member.id),
  );
  return result;
}

export async function deleteProject(
  id: string,
  actor: ProjectActor,
): Promise<{ deleted: true }> {
  operatorOnly(actor);
  const members = await getSql().begin(async (sql) => {
    await lockProject(sql, id, actor);
    const ids = await projectMemberIds(sql, id);
    await projectActivity(sql, id, actor, "project.deleted");
    await sql`update projects set deleted_at=now() where id=${id}`;
    return ids;
  });
  publishProject(id, members);
  return { deleted: true };
}
