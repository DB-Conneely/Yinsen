"use client";
import { useState, type ReactElement, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { clientRequest } from "./client-forms";
import type { ProjectDetail } from "../lib/projects/queries";
import { minorAmount, budgetInput } from "../lib/money";

export function ProjectForm({
  project,
  clients,
  currency,
}: {
  project?: ProjectDetail;
  clients: { id: string; name: string }[];
  currency: string;
}): ReactElement {
  const router = useRouter();
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
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const rawBudget = data.get("budget");
    const budget = typeof rawBudget === "string" ? rawBudget : "";
    const rawCurrency = data.get("currency");
    const selectedCurrency =
      typeof rawCurrency === "string" ? rawCurrency : currency;
    const clientIds = [
      primary,
      ...data
        .getAll("members")
        .map(String)
        .filter((id) => id !== primary),
    ];
    try {
      const saved = await clientRequest(
        `/api/projects${project ? `/${project.id}` : ""}`,
        project ? "PATCH" : "POST",
        {
          name: data.get("name"),
          description: data.get("description"),
          budget: minorAmount(budget, selectedCurrency),
          currency: data.get("currency"),
          startDate: data.get("startDate") || null,
          dueDate: data.get("dueDate") || null,
          clientIds,
        },
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
      className="card client-form"
      aria-busy={pending}
      onSubmit={(event) => {
        void submit(event);
      }}
    >
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
            {client.name}
          </option>
        ))}
      </select>
      <fieldset>
        <legend>Additional members</legend>
        <p className="hint">
          All members can confirm lock-in. The primary client approves
          milestones.
        </p>
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
            {client.name}
          </label>
        ))}
      </fieldset>
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
      <label htmlFor="project-currency">Currency</label>
      <input
        id="project-currency"
        name="currency"
        required
        pattern="[A-Z]{3}"
        maxLength={3}
        defaultValue={project?.currency ?? currency}
      />
      <label htmlFor="project-start">Start date</label>
      <input
        id="project-start"
        name="startDate"
        type="date"
        defaultValue={project?.startDate ?? ""}
      />
      <label htmlFor="project-due">Due date</label>
      <input
        id="project-due"
        name="dueDate"
        type="date"
        defaultValue={project?.dueDate ?? ""}
      />
      <p role="alert">{error}</p>
      <button disabled={pending || !primary} type="submit">
        {pending ? "Saving…" : "Save project"}
      </button>
    </form>
  );
}
