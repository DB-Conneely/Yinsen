"use client";
import { useState, type ReactElement, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { clientRequest } from "./client-forms";
import type { ProjectDetail } from "../lib/projects/queries";
import { minorAmount, budgetInput, formatBudget } from "../lib/money";

const currentProject = z.object({
  editRevision: z.string(),
  name: z.string(),
  description: z.string(),
  budget: z.number().nullable(),
  currency: z.string(),
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  members: z.array(
    z.object({ id: z.string(), name: z.string(), role: z.string() }),
  ),
});

function projectDraft(
  data: FormData,
  primary: string,
  currency: string,
): Record<string, unknown> {
  const budget = data.get("budget"),
    selectedCurrency = data.get("currency");
  return {
    name: data.get("name"),
    description: data.get("description"),
    budget: minorAmount(
      typeof budget === "string" ? budget : "",
      typeof selectedCurrency === "string" ? selectedCurrency : currency,
    ),
    currency: selectedCurrency,
    startDate: data.get("startDate") || null,
    dueDate: data.get("dueDate") || null,
    clientIds: [
      primary,
      ...data
        .getAll("members")
        .map(String)
        .filter((id) => id !== primary)
        .sort(),
    ],
  };
}

function projectChanges(
  project: ProjectDetail,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const original: Record<string, unknown> = {
    name: project.name,
    description: project.description,
    budget: project.budget,
    currency: project.currency,
    startDate: project.startDate,
    dueDate: project.dueDate,
    clientIds: [
      project.members.find((member) => member.role === "primary")?.id,
      ...project.members
        .filter((member) => member.role !== "primary")
        .map((member) => member.id)
        .sort(),
    ],
  };
  const changes = Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key]),
    ),
  );
  if (changes.budget !== undefined || changes.currency !== undefined) {
    changes.budget = fields.budget;
    changes.currency = fields.currency;
  }
  return changes;
}

export function ProjectForm({
  project: suppliedProject,
  clients,
  currency,
}: {
  project?: ProjectDetail;
  clients: { id: string; name: string; email: string }[];
  currency: string;
}): ReactElement {
  const router = useRouter();
  // A server refresh must not silently replace the draft's original baseline.
  const [project] = useState(suppliedProject);
  const [expectedRevision, setExpectedRevision] = useState(
    project?.editRevision,
  );
  const [review, setReview] = useState<z.infer<typeof currentProject> | null>(
    null,
  );
  const primaryId = project?.members.find(
    (member) => member.role === "primary",
  )?.id;
  const [primary, setPrimary] = useState(
    primaryId && clients.some((client) => client.id === primaryId)
      ? primaryId
      : project
        ? ""
        : (clients[0]?.id ?? ""),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function reviewCurrent(): Promise<void> {
    if (!project) return;
    setPending(true);
    try {
      setReview(
        await clientRequest(
          `/api/projects/${project.id}`,
          "GET",
          undefined,
          currentProject,
        ),
      );
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to load current project.",
      );
    } finally {
      setPending(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const fields = projectDraft(data, primary, currency);
      const saved = await clientRequest(
        `/api/projects${project ? `/${project.id}` : ""}`,
        project ? "PATCH" : "POST",
        project
          ? { ...projectChanges(project, fields), expectedRevision }
          : fields,
        z.object({ id: z.uuid() }),
      );
      router.push(`/dashboard/projects/${saved.id}`);
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : "Unable to save project.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="card client-form project-form"
      aria-busy={pending}
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <fieldset className="form-section">
        <legend>Project scope</legend>
        <label htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          name="name"
          required
          maxLength={255}
          defaultValue={project?.name}
        />
        <label htmlFor="project-description">Scope and description</label>
        <textarea
          id="project-description"
          name="description"
          maxLength={4000}
          defaultValue={project?.description}
        />
      </fieldset>
      <fieldset className="form-section">
        <legend>Clients & access</legend>
        <label htmlFor="project-primary">Primary client</label>
        <select
          id="project-primary"
          value={primary}
          required
          onChange={(event) => setPrimary(event.target.value)}
        >
          <option value="" disabled>
            Choose an active primary client
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name} · {client.email}
            </option>
          ))}
        </select>
        <fieldset>
          <legend>Additional members</legend>
          <p className="hint">
            All members can confirm lock-in. The primary client approves
            milestones.
          </p>
          <div className="member-options">
            {clients.map((client) => (
              <label className="checkbox" key={client.id}>
                <input
                  type="checkbox"
                  name="members"
                  value={client.id}
                  disabled={client.id === primary}
                  defaultChecked={project?.members.some(
                    (member) =>
                      member.id === client.id && member.role !== "primary",
                  )}
                />
                <span>
                  {client.name}
                  <small>{client.email}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>
      <fieldset className="form-section">
        <legend>Budget & schedule</legend>
        <div className="form-grid">
          <div>
            <label htmlFor="project-budget">Budget (optional)</label>
            <input
              id="project-budget"
              name="budget"
              inputMode="decimal"
              defaultValue={budgetInput(
                project?.budget ?? null,
                project?.currency ?? currency,
              )}
            />
            <p className="hint">
              Enter an amount in the selected currency, for example 125.00.
            </p>
          </div>
          <div>
            <label htmlFor="project-currency">Currency</label>
            <input
              id="project-currency"
              name="currency"
              required
              pattern="[A-Z]{3}"
              maxLength={3}
              defaultValue={project?.currency ?? currency}
            />
          </div>
          <div>
            <label htmlFor="project-start">Start date</label>
            <input
              id="project-start"
              name="startDate"
              type="date"
              defaultValue={project?.startDate ?? ""}
            />
          </div>
          <div>
            <label htmlFor="project-due">Due date</label>
            <input
              id="project-due"
              name="dueDate"
              type="date"
              defaultValue={project?.dueDate ?? ""}
            />
          </div>
        </div>
      </fieldset>
      <p role="alert">{error}</p>
      {project && error && (
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => {
            void reviewCurrent();
          }}
        >
          Review current saved values
        </button>
      )}
      {review && (
        <section className="card" aria-label="Current saved project">
          <h2>Current saved project</h2>
          <p>
            Your draft is kept above. Compare it with these saved values.
            Retrying applies only the fields you changed in your draft.
          </p>
          <h3>{review.name}</h3>
          <p className="preserve-lines">
            {review.description || "No description added."}
          </p>
          <p>{formatBudget(review.budget, review.currency)}</p>
          <p>
            Start: {review.startDate ?? "Not set"} · Due:{" "}
            {review.dueDate ?? "Not set"}
          </p>
          <ul>
            {review.members.map((member) => (
              <li key={member.id}>
                {member.name} · {member.role}
                {clients.find((client) => client.id === member.id)?.email && (
                  <small className="member-email">
                    {clients.find((client) => client.id === member.id)?.email}
                  </small>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setExpectedRevision(review.editRevision);
              setReview(null);
              setError(
                "Current values reviewed. Save project to retry your changed fields.",
              );
            }}
          >
            Use reviewed values for retry
          </button>
        </section>
      )}
      <button disabled={pending || !primary} type="submit">
        {pending ? "Saving…" : "Save project"}
      </button>
    </form>
  );
}
