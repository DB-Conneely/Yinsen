import type postgres from "postgres";
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
};
export type ProjectDetail = Project & {
  members: ProjectMember[];
  milestones: Milestone[];
  activity: {
    id: string;
    eventType: string;
    actorType: string;
    createdAt: string;
  }[];
};

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
  const [rows, members, milestones, activity] = await Promise.all([
    sql<
      Project[]
    >`select id,name,description,status,budget,currency,start_date::text as "startDate",due_date::text as "dueDate",updated_at::text as "updatedAt" from projects where id=${id}`,
    sql<
      ProjectMember[]
    >`select c.id,c.name,pc.role,(c.deleted_at is not null) as archived from project_clients pc join clients c on c.id=pc.client_id where pc.project_id=${id} order by pc.role desc,c.name,c.id`,
    sql<
      Milestone[]
    >`select id,project_id as "projectId",name,description,status,position,due_date::text as "dueDate" from milestones where project_id=${id} order by position,id`,
    sql<
      ProjectDetail["activity"]
    >`select id,event_type as "eventType",actor_type as "actorType",created_at::text as "createdAt" from project_activity where project_id=${id} order by created_at desc,id desc limit 30`,
  ]);
  const project = rows[0];
  if (!project) throw new AppError(404, "NOT_FOUND", "Project not found.");
  return { ...project, members, milestones, activity };
}
