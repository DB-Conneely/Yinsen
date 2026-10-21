import type postgres from "postgres";
import { createHash } from "node:crypto";
import { getSql } from "../db/client";
import { projectAccess, type ProjectActor } from "./access";
import { projectStatus, milestoneStatus } from "./validation";
import { AppError } from "../errors";
import { z } from "zod";
import { resourceId } from "./validation";

const filtersSchema = z
  .object({
    status: projectStatus.optional(),
    client_id: resourceId.optional(),
  })
  .strict();

export type Project = {
  id: string;
  name: string;
  description: string;
  status: z.infer<typeof projectStatus>;
  budget: number | null;
  currency: string;
  startDate: string | null;
  dueDate: string | null;
  updatedAt: string;
};
export type ProjectMember = {
  id: string;
  name: string;
  role: "primary" | "member";
  archived: boolean;
};
export type Milestone = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  status: z.infer<typeof milestoneStatus>;
  position: number;
  dueDate: string | null;
  reviewRevision: string;
};
export type ProjectDetail = Project & {
  editRevision: string;
  lockRevision: string;
  completionRevision: string;
  members: ProjectMember[];
  milestones: Milestone[];
  activity: {
    id: string;
    eventType: string;
    actorType: string;
    createdAt: string;
  }[];
};

function revision(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function withMilestoneRevision(
  milestone: Omit<Milestone, "reviewRevision">,
): Milestone {
  return {
    ...milestone,
    reviewRevision: revision([
      milestone.id,
      milestone.projectId,
      milestone.name,
      milestone.description,
      milestone.dueDate,
      milestone.status,
    ]),
  };
}

function withRevisions(
  project: Project,
  members: ProjectMember[],
  milestones: Omit<Milestone, "reviewRevision">[],
  activity: ProjectDetail["activity"],
  completionFacts: unknown,
): ProjectDetail {
  const fields = [
    project.id,
    project.name,
    project.description,
    project.budget,
    project.currency,
    project.startDate,
    project.dueDate,
    members
      .map((member) => ({ id: member.id, role: member.role }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  ];
  const reviewedMilestones = milestones.map(withMilestoneRevision);
  const lockRevision = revision([
    fields,
    project.status,
    reviewedMilestones.map((milestone) => [
      milestone.id,
      milestone.position,
      milestone.reviewRevision,
    ]),
  ]);
  return {
    ...project,
    members,
    milestones: reviewedMilestones,
    activity,
    editRevision: revision(fields),
    lockRevision,
    completionRevision: revision([lockRevision, completionFacts]),
  };
}

export async function listProjects(
  actor: ProjectActor,
  input: unknown = {},
): Promise<
  (Project & {
    milestoneCount: number;
    approvedCount: number;
    clientName: string;
  })[]
> {
  const filters = filtersSchema.parse(input);
  return getSql()`select p.id,p.name,p.description,p.status,p.budget,p.currency,p.start_date::text as "startDate",p.due_date::text as "dueDate",p.updated_at::text as "updatedAt",(select count(*)::int from milestones m where m.project_id=p.id) as "milestoneCount",(select count(*)::int from milestones m where m.project_id=p.id and m.status='approved') as "approvedCount",(select c.name from project_clients pc join clients c on c.id=pc.client_id where pc.project_id=p.id and pc.role='primary') as "clientName" from projects p where p.deleted_at is null and (${filters.status ?? null}::text is null or p.status=${filters.status ?? null}) and (${filters.client_id ?? null}::uuid is null or exists(select 1 from project_clients f where f.project_id=p.id and f.client_id=${filters.client_id ?? null})) and (${actor.role === "operator"} or exists (select 1 from project_clients pc join clients c on c.id=pc.client_id where pc.project_id=p.id and pc.client_id=${actor.id} and c.deleted_at is null)) order by p.updated_at desc,p.id`;
}

export async function getProject(
  id: string,
  actor: ProjectActor,
  sql: postgres.Sql | postgres.TransactionSql = getSql(),
): Promise<ProjectDetail> {
  if (sql === getSql())
    return getSql().begin(async (transaction) => {
      await transaction`select id from projects where id=${resourceId.parse(id)} for share`;
      return getProject(id, actor, transaction);
    });
  await projectAccess(id, actor, sql);
  const [rows, members, milestones, activity, submissions, files] =
    await Promise.all([
      sql<
        Project[]
      >`select id,name,description,status,budget,currency,start_date::text as "startDate",due_date::text as "dueDate",updated_at::text as "updatedAt" from projects where id=${id}`,
      sql<
        ProjectMember[]
      >`select c.id,c.name,pc.role,(c.deleted_at is not null) as archived from project_clients pc join clients c on c.id=pc.client_id where pc.project_id=${id} order by pc.role desc,c.name,c.id`,
      sql<
        Omit<Milestone, "reviewRevision">[]
      >`select id,project_id as "projectId",name,description,status,position,due_date::text as "dueDate" from milestones where project_id=${id} order by position,id`,
      sql<
        ProjectDetail["activity"]
      >`select id,event_type as "eventType",actor_type as "actorType",created_at::text as "createdAt" from project_activity where project_id=${id} and event_type not like 'invoice.%' order by created_at desc,id desc limit 30`,
      // Independent of the paged activity: unchanged terms in a later round must not revive an old decision.
      sql`select id from project_activity where project_id=${id} and event_type='project.submitted_for_approval' order by created_at desc,id desc limit 1`,
      sql`select d.id,d.filename,d.sha256,d.version,d.parent_deliverable_id,d.released from deliverables d join milestones m on m.id=d.milestone_id where m.project_id=${id} order by d.id`,
    ]);
  const project = rows[0];
  if (!project) throw new AppError(404, "NOT_FOUND", "Project not found.");
  return withRevisions(project, members, milestones, activity, [
    submissions[0]?.id ?? null,
    files,
  ]);
}
