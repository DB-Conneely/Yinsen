import type postgres from "postgres";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { projectAccess, type ProjectActor } from "../projects/access";
import { resourceId } from "../projects/validation";

export type Deliverable = {
  id: string;
  milestoneId: string;
  parentDeliverableId: string | null;
  version: number;
  filename: string;
  size: number;
  released: boolean;
  uploadedAt: string;
};

export async function milestoneProject(
  id: string,
  sql: postgres.Sql | postgres.TransactionSql = getSql(),
): Promise<string> {
  const rows = await sql<
    { projectId: string }[]
  >`select project_id as "projectId" from milestones where id=${resourceId.parse(id)}`;
  if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Milestone not found.");
  return rows[0].projectId;
}

export async function listDeliverables(
  projectId: string,
  actor: ProjectActor,
  sql: postgres.Sql | postgres.TransactionSql = getSql(),
): Promise<Deliverable[]> {
  await projectAccess(projectId, actor, sql);
  return sql<
    Deliverable[]
  >`select d.id,d.milestone_id as "milestoneId",d.parent_deliverable_id as "parentDeliverableId",d.version,d.filename,d.size::float8 as size,d.released,d.uploaded_at::text as "uploadedAt" from deliverables d join milestones m on m.id=d.milestone_id where m.project_id=${projectId} order by d.uploaded_at,d.id`;
}
