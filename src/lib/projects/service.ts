import type postgres from "postgres";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { publishProject } from "../events/hub";
import { writeMessage } from "../messages/service";
import { lockProject, operatorOnly, type ProjectActor } from "./access";
import { getProject, type ProjectDetail } from "./queries";
import {
  projectFields,
  projectPatch,
  projectStatus,
  resourceId,
  reviewedVersion,
  disputeDecision,
} from "./validation";

type Fields = z.infer<typeof projectFields>;
type Agreement = {
  messageId: string;
  snapshot: import("../messages/proposal-validators").ProposalTerms;
};

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

// The caller owns authorization and the outer transaction (manual edit or mutual proposal acceptance).
export async function writeProject(
  sql: postgres.TransactionSql,
  input: unknown,
  actor: ProjectActor,
  id?: string,
  agreement?: Agreement,
): Promise<string> {
  const fields = projectFields.parse(input);
  await validateMembers(sql, fields);
  const savedId = await writeFields(sql, fields, id);
  if (agreement) {
    if (id)
      throw new AppError(
        409,
        "INVALID_AGREEMENT",
        "An agreement must create a new project.",
      );
    await sql`update projects set status='active',proposal_message_id=${agreement.messageId},proposal_snapshot=${JSON.stringify(agreement.snapshot)}::text::jsonb where id=${savedId}`;
  }
  await projectActivity(
    sql,
    savedId,
    actor,
    id ? "project.updated" : "project.created",
  );
  return savedId;
}

function mergedFields(
  current: ProjectDetail | undefined,
  patch: unknown,
): Fields {
  if (!current) return projectFields.parse(patch);
  return projectFields.parse({
    name: current.name,
    description: current.description,
    budget: current.budget,
    currency: current.currency,
    startDate: current.startDate,
    dueDate: current.dueDate,
    clientIds: [...current.members]
      .sort(
        (a, b) => Number(b.role === "primary") - Number(a.role === "primary"),
      )
      .map((member) => member.id),
    ...projectPatch.omit({ expectedRevision: true }).parse(patch),
  });
}

export async function saveProject(
  input: unknown,
  actor: ProjectActor,
  id?: string,
): Promise<ProjectDetail> {
  operatorOnly(actor);
  const { expectedRevision, ...patch } = id
    ? projectPatch.parse(input)
    : { ...projectFields.parse(input), expectedRevision: undefined };
  const result = await getSql().begin(async (sql) => {
    if (id) await lockProject(sql, resourceId.parse(id), actor);
    const current = id ? await getProject(id, actor, sql) : undefined;
    if (current && expectedRevision !== current.editRevision)
      throw new AppError(
        409,
        "PROJECT_CHANGED",
        "This project changed while you were editing. Your draft is kept. Review the current saved values before retrying.",
      );
    const fields = mergedFields(current, patch);
    const savedId = await writeProject(sql, fields, actor, id);
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

function allowedTransition(
  current: ProjectDetail,
  next: z.infer<typeof projectStatus>,
  actor: ProjectActor,
  reason: string | undefined,
): boolean {
  return actor.role === "client"
    ? (current.status === "pending_lockin" && next === "active" && !reason) ||
        (current.status === "pending_approval" &&
          (next === "completed" || (next === "active" && reason !== undefined)))
    : (current.status === "draft" && next === "pending_lockin") ||
        (current.status === "active" && next === "paused") ||
        (current.status === "paused" && next === "active") ||
        (current.status === "active" && next === "pending_approval") ||
        (current.status === "completed" && next === "archived");
}

function validateCompletionActor(
  current: ProjectDetail,
  actor: ProjectActor,
): void {
  if (
    actor.role === "client" &&
    current.status === "pending_approval" &&
    !current.members.some(
      (member) => member.id === actor.id && member.role === "primary",
    )
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the current primary client can decide project completion.",
    );
}

function validateTransition(
  current: ProjectDetail,
  next: z.infer<typeof projectStatus>,
  expectedRevision: string | undefined,
  actor: ProjectActor,
  reason: string | undefined,
): void {
  const completion =
    current.status === "pending_approval" ||
    next === "pending_approval" ||
    next === "archived";
  validateCompletionActor(current, actor);
  if (!allowedTransition(current, next, actor, reason))
    throw new AppError(
      409,
      "INVALID_TRANSITION",
      "This project has changed or the requested transition is not allowed. Refresh and review its current state.",
    );
  if (
    (actor.role === "client" || completion) &&
    reviewedVersion.shape.expectedRevision.parse(expectedRevision) !==
      (completion ? current.completionRevision : current.lockRevision)
  )
    throw new AppError(
      409,
      "PROJECT_CHANGED",
      "The project changed. Review its current scope, files, milestones and submission before confirming again.",
    );
}

function transitionEvent(
  current: ProjectDetail,
  next: z.infer<typeof projectStatus>,
): string {
  if (next === "pending_approval") return "project.submitted_for_approval";
  if (next === "completed") return "project.accepted";
  if (current.status === "pending_approval") return "project.disputed";
  if (current.status === "pending_lockin" && next === "active")
    return "project.locked_in";
  return `project.${next}`;
}

async function writeDispute(
  sql: postgres.TransactionSql,
  id: string,
  actor: ProjectActor,
  reason: string,
): Promise<void> {
  const body = `Completion disputed\n\n${reason}`;
  await writeMessage(sql, { kind: "project", id }, actor, {
    id: randomUUID(),
    body,
    fingerprint: createHash("sha256").update(body).digest("hex"),
    type: "message",
    chainId: null,
    replyTo: null,
    proposalData: null,
  });
}

const transitionInput = z
  .object({
    status: projectStatus,
    expectedRevision: reviewedVersion.shape.expectedRevision.optional(),
    reason: disputeDecision.shape.reason.optional(),
  })
  .strict();

async function writeTransition(
  sql: postgres.TransactionSql,
  id: string,
  data: z.infer<typeof transitionInput>,
  actor: ProjectActor,
): Promise<ProjectDetail> {
  const next = data.status;
  await lockProject(sql, id, actor);
  const current = await getProject(id, actor, sql);
  validateTransition(current, next, data.expectedRevision, actor, data.reason);
  if (data.reason !== undefined) {
    if (
      actor.role !== "client" ||
      current.status !== "pending_approval" ||
      next !== "active"
    )
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "A reason belongs only to a completion dispute.",
      );
    await writeDispute(sql, id, actor, data.reason);
  }
  await sql`update projects set status=${next} where id=${id}`;
  await projectActivity(sql, id, actor, transitionEvent(current, next));
  return getProject(id, actor, sql);
}

export async function transitionProject(
  id: string,
  input: unknown,
  actor: ProjectActor,
): Promise<ProjectDetail> {
  const data = transitionInput.parse(input);
  const result = await getSql().begin((sql) =>
    writeTransition(sql, id, data, actor),
  );
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
