import { z } from "zod";
import type postgres from "postgres";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { publishProject } from "../events/hub";
import {
  lockProject,
  operatorOnly,
  type ProjectActor,
} from "../projects/access";
import { getProject, type ProjectDetail } from "../projects/queries";
import { projectActivity } from "../projects/service";
import {
  milestoneFields,
  milestonePatch,
  resourceId,
  reviewedVersion,
} from "../projects/validation";

async function milestoneProject(id: string): Promise<string> {
  const rows = await getSql()<
    { projectId: string }[]
  >`select project_id as "projectId" from milestones where id=${resourceId.parse(id)}`;
  if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Project not found.");
  return rows[0].projectId;
}

async function renumber(
  sql: postgres.TransactionSql,
  projectId: string,
  ids: string[],
): Promise<void> {
  for (const [position, id] of ids.entries())
    await sql`update milestones set position=${position},updated_at=now() where id=${id} and project_id=${projectId}`;
}

export async function createMilestone(
  projectId: string,
  input: unknown,
  actor: ProjectActor,
): Promise<ProjectDetail> {
  operatorOnly(actor);
  const project = await getSql().begin(async (sql) => {
    await lockProject(sql, projectId, actor);
    await writeMilestone(sql, projectId, input, actor);
    return getProject(projectId, actor, sql);
  });
  publishProject(
    projectId,
    project.members.map((member) => member.id),
  );
  return project;
}

// Consumed inside the caller's project lock/creation transaction, including proposal acceptance.
export async function writeMilestone(
  sql: postgres.TransactionSql,
  projectId: string,
  input: unknown,
  actor: ProjectActor,
): Promise<void> {
  const fields = milestoneFields.parse(input);
  const rows =
    await sql`select id from milestones where project_id=${projectId}`;
  if (rows.length >= 200)
    throw new AppError(
      409,
      "MILESTONE_LIMIT",
      "Use at most 200 milestones per project.",
    );
  await sql`insert into milestones(project_id,name,description,due_date,position) values (${projectId},${fields.name},${fields.description},${fields.dueDate},${rows.length})`;
  await projectActivity(sql, projectId, actor, "milestone.created");
}

async function updateMilestone(
  sql: postgres.TransactionSql,
  project: ProjectDetail,
  id: string,
  input: unknown,
): Promise<void> {
  const data = milestonePatch
    .extend({
      status: z.enum(["pending", "in_progress", "review"]).optional(),
      position: z.number().int().min(0).optional(),
    })
    .strict()
    .parse(input);
  const current = project.milestones.find((milestone) => milestone.id === id);
  if (!current) throw new AppError(404, "NOT_FOUND", "Project not found.");
  if (
    data.status &&
    data.status !== current.status &&
    !(
      (current.status === "pending" && data.status === "in_progress") ||
      (current.status === "in_progress" && data.status === "review") ||
      (current.status === "review" && data.status === "in_progress")
    )
  )
    throw new AppError(
      409,
      "INVALID_TRANSITION",
      "Move a milestone from pending to in progress, then review. Review can return to in progress.",
    );
  await sql`update milestones set name=${data.name ?? current.name},description=${data.description ?? current.description},due_date=${data.dueDate === undefined ? current.dueDate : data.dueDate},status=${data.status ?? current.status},updated_at=now() where id=${id}`;
  if (data.position !== undefined) {
    if (data.position >= project.milestones.length)
      throw new AppError(
        400,
        "INVALID_POSITION",
        "Choose a position within this milestone list.",
      );
    const ids = project.milestones
      .filter((milestone) => milestone.id !== id)
      .map((milestone) => milestone.id);
    ids.splice(data.position, 0, id);
    await renumber(sql, project.id, ids);
  }
}

export async function mutateMilestone(
  id: string,
  input: unknown,
  actor: ProjectActor,
  action: "update" | "delete" | "approve",
): Promise<ProjectDetail> {
  if (action !== "approve") operatorOnly(actor);
  const projectId = await milestoneProject(id);
  const project = await getSql().begin(async (sql) => {
    await lockProject(sql, projectId, actor);
    const current = await getProject(projectId, actor, sql);
    const milestone = current.milestones.find((item) => item.id === id);
    if (!milestone) throw new AppError(404, "NOT_FOUND", "Project not found.");
    if (action === "approve")
      await approveMilestone(sql, current, id, actor, input);
    else if (action === "delete") {
      await sql`delete from milestones where id=${id}`;
      await renumber(
        sql,
        projectId,
        current.milestones
          .filter((item) => item.id !== id)
          .map((item) => item.id),
      );
    } else await updateMilestone(sql, current, id, input);
    await projectActivity(
      sql,
      projectId,
      actor,
      `milestone.${action === "approve" ? "approved" : action === "delete" ? "deleted" : "updated"}`,
    );
    return getProject(projectId, actor, sql);
  });
  publishProject(
    projectId,
    project.members.map((member) => member.id),
  );
  return project;
}

async function approveMilestone(
  sql: postgres.TransactionSql,
  project: ProjectDetail,
  id: string,
  actor: ProjectActor,
  input: unknown,
): Promise<void> {
  if (
    actor.role !== "client" ||
    !project.members.some(
      (member) => member.id === actor.id && member.role === "primary",
    )
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the primary client can approve a milestone.",
    );
  if (project.milestones.find((item) => item.id === id)?.status !== "review")
    throw new AppError(
      409,
      "INVALID_TRANSITION",
      "Only a milestone in review can be approved.",
    );
  if (
    reviewedVersion.parse(input).expectedRevision !==
    project.milestones.find((item) => item.id === id)?.reviewRevision
  )
    throw new AppError(
      409,
      "MILESTONE_CHANGED",
      "The milestone changed. Review its current description and due date before approving again.",
    );
  await sql`update milestones set status='approved',updated_at=now() where id=${id}`;
}
