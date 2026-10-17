import type { ReactElement } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProject,
  listProjects,
  type ProjectDetail,
} from "../lib/projects/queries";
import { operatorOnly, type ProjectActor } from "../lib/projects/access";
import { getSql } from "../lib/db/client";
import { getBranding } from "../lib/settings";
import { AppError } from "../lib/errors";
import { ProjectLive } from "./project-live";
import { ProjectForm } from "./project-form";
import { ProjectActions } from "./project-actions";
import { MilestoneEditor, MilestoneActions } from "./milestone-editor";
import { projectStatus } from "../lib/projects/validation";
import { MessageThread } from "./message-thread";
import { readConfiguration } from "../lib/config";
import { messageSummary } from "../lib/messages/queries";
import { formatBudget } from "../lib/money";
import { listDeliverables } from "../lib/deliverables/queries";
import { MilestoneFiles } from "./milestone-files";

function status(value: string): string {
  return value.replaceAll("_", " ");
}
async function detail(id: string, actor: ProjectActor): Promise<ProjectDetail> {
  try {
    return await getProject(id, actor);
  } catch (failure: unknown) {
    if (failure instanceof AppError && failure.statusCode === 404) notFound();
    throw failure;
  }
}

export async function ProjectList({
  actor,
  statusFilter,
}: {
  actor: ProjectActor;
  statusFilter?: string;
}): Promise<ReactElement> {
  const parsed = projectStatus.safeParse(statusFilter);
  const projects = await listProjects(
    actor,
    parsed.success ? { status: parsed.data } : {},
  );
  const summary = await messageSummary(actor);
  const root =
    actor.role === "operator" ? "/dashboard/projects" : "/portal/projects";
  return (
    <ProjectLive>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Shared work</p>
          <h1>Projects</h1>
          <p>Agreed scope, milestones and the next step.</p>
        </div>
        {actor.role === "operator" && (
          <Link className="button" href={`${root}/new`}>
            New project
          </Link>
        )}
      </div>
      <form className="card project-filter" method="get">
        <label>
          Status
          <select
            name="status"
            defaultValue={parsed.success ? parsed.data : ""}
          >
            <option value="">All projects</option>
            {projectStatus.options.map((value) => (
              <option key={value} value={value}>
                {status(value)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter projects</button>
      </form>
      {projects.length ? (
        <div className="project-grid">
          {projects.map((project) => (
            <Link
              className="card project-card"
              href={`${root}/${project.id}`}
              key={project.id}
            >
              <span className="status-badge" data-status={project.status}>
                {status(project.status)}
              </span>
              <h2>{project.name}</h2>
              {summary.conversations.find(
                (item) => item.kind === "project" && item.id === project.id,
              )?.unread ? (
                <span className="unread-badge">
                  {
                    summary.conversations.find(
                      (item) =>
                        item.kind === "project" && item.id === project.id,
                    )?.unread
                  }{" "}
                  unread
                </span>
              ) : null}
              <p className="project-client">{project.clientName}</p>
              <p className="project-card-budget">
                {formatBudget(project.budget, project.currency)}
              </p>
              <p className="field-help">
                {project.approvedCount} of {project.milestoneCount} milestones
                approved
              </p>
              {project.milestoneCount > 0 && (
                <progress
                  aria-label={`${project.name} milestones approved`}
                  value={project.approvedCount}
                  max={project.milestoneCount}
                />
              )}
              {project.dueDate && (
                <p className="project-due">Due {project.dueDate}</p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <section className="card empty-state">
          <h2>No projects yet</h2>
          <p>
            {actor.role === "operator"
              ? "Create a project to agree the scope and milestones with your clients."
              : "Projects shared with you will appear here."}
          </p>
        </section>
      )}
    </ProjectLive>
  );
}

export async function ProjectWorkspace({
  id,
  actor,
}: {
  id: string;
  actor: ProjectActor;
}): Promise<ReactElement> {
  const project = await detail(id, actor);
  const files = await listDeliverables(id, actor);
  const operator = actor.role === "operator";
  const primary = project.members.some(
    (member) => member.id === actor.id && member.role === "primary",
  );
  return (
    <ProjectLive projectId={id}>
      <Link
        className="back-link"
        href={operator ? "/dashboard/projects" : "/portal/projects"}
      >
        ← Projects
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Project workspace</p>
          <h1>{project.name}</h1>
          <span className="status-badge" data-status={project.status}>
            {status(project.status)}
          </span>
        </div>
        <div className="workspace-budget">
          <span>Project budget</span>
          <strong>{formatBudget(project.budget, project.currency)}</strong>
        </div>
      </div>
      {project.status === "pending_lockin" && (
        <div className="card project-banner">
          <h2>Ready to agree the work</h2>
          <p>
            {operator
              ? "Waiting for a project member to review and confirm this scope, budget and milestones."
              : "Review the scope, budget and milestones below, then confirm lock-in to start."}
          </p>
        </div>
      )}
      {project.status === "paused" && (
        <p className="card">This project is paused.</p>
      )}
      <section className="card project-overview">
        <div className="project-scope">
          <h2>Scope</h2>
          <p className="preserve-lines">
            {project.description || "No description added."}
          </p>
        </div>
        <dl className="project-facts">
          <div>
            <dt>Start</dt>
            <dd>{project.startDate ?? "Not set"}</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{project.dueDate ?? "Not set"}</dd>
          </div>
          <div>
            <dt>Clients</dt>
            <dd>
              {project.members.map((member) => (
                <span className="member-label" key={member.id}>
                  {member.name} · {member.role}
                  {member.archived ? " (archived)" : ""}
                </span>
              ))}
            </dd>
          </div>
        </dl>
        <ProjectActions project={project} operator={operator} />
      </section>
      <section className="project-section" aria-label="Project milestones">
        <div className="page-heading">
          <h2>Milestones</h2>
          <p>
            {
              project.milestones.filter((item) => item.status === "approved")
                .length
            }{" "}
            / {project.milestones.length} approved
          </p>
        </div>
        {project.milestones.length ? (
          <ol className="milestone-list">
            {project.milestones.map((milestone) => (
              <li className="card milestone-card" key={milestone.id}>
                <div className="page-heading">
                  <h3>{milestone.name}</h3>
                  <span className="status-badge" data-status={milestone.status}>
                    {status(milestone.status)}
                  </span>
                </div>
                <p className="preserve-lines">{milestone.description}</p>
                {milestone.dueDate && <p>Due {milestone.dueDate}</p>}
                <MilestoneFiles
                  milestoneId={milestone.id}
                  milestoneName={milestone.name}
                  files={files.filter(
                    (file) => file.milestoneId === milestone.id,
                  )}
                  operator={operator}
                  maxBytes={readConfiguration().storage.maxBytes}
                />
                <MilestoneActions
                  milestone={milestone}
                  total={project.milestones.length}
                  operator={operator}
                  primary={primary}
                />
                {operator && (
                  <details>
                    <summary>Edit milestone</summary>
                    <MilestoneEditor projectId={id} milestone={milestone} />
                  </details>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="card">No milestones yet.</p>
        )}
        {operator && (
          <details className="card">
            <summary>Add a milestone</summary>
            <MilestoneEditor projectId={id} />
          </details>
        )}
      </section>
      <MessageThread
        key={id}
        conversation={{ kind: "project", id }}
        actorId={actor.id}
        operator={actor.role === "operator"}
        defaultCurrency={project.currency}
        maxBytes={readConfiguration().storage.maxBytes}
      />
      <details className="card project-history">
        <summary>Project activity</summary>
        <ol className="activity-list">
          {project.activity.map((item) => (
            <li key={item.id}>
              <strong>{status(item.eventType.replace(".", " "))}</strong>
              <span>
                {item.actorType} ·{" "}
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString("en-GB", {
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </time>
              </span>
            </li>
          ))}
        </ol>
      </details>
    </ProjectLive>
  );
}

export async function ProjectEditor({
  id,
  actor,
}: {
  id?: string;
  actor: ProjectActor;
}): Promise<ReactElement> {
  operatorOnly(actor);
  const project = id ? await detail(id, actor) : undefined;
  const clients = await getSql()<
    { id: string; name: string; email: string }[]
  >`select id,name,email from clients where deleted_at is null order by lower(name),id`;
  const branding = await getBranding();
  return (
    <>
      <Link
        className="back-link"
        href={id ? `/dashboard/projects/${id}` : "/dashboard/projects"}
      >
        ← Projects
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Project details</p>
          <h1>{id ? "Edit project" : "New project"}</h1>
          <p>Define the work, choose your clients and set the terms.</p>
        </div>
      </div>
      {clients.length ? (
        <ProjectForm
          key={id ?? "new"}
          project={project}
          clients={clients}
          currency={branding?.defaultCurrency ?? "GBP"}
        />
      ) : (
        <section className="card">
          <p>Create an active client before adding a project.</p>
          <Link href="/dashboard/clients/new">Create a client</Link>
        </section>
      )}
    </>
  );
}
