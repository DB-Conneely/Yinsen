"use client";
import {
  useState,
  useRef,
  useEffect,
  type ReactElement,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { clientRequest } from "./client-forms";
import type { Milestone } from "../lib/projects/queries";

export function MilestoneEditor({
  projectId,
  milestone,
}: {
  projectId: string;
  milestone?: Milestone;
}): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await clientRequest(
        milestone
          ? `/api/milestones/${milestone.id}`
          : `/api/projects/${projectId}/milestones`,
        milestone ? "PATCH" : "POST",
        {
          name: data.get("name"),
          description: data.get("description"),
          dueDate: data.get("dueDate") || null,
        },
        z.unknown(),
      );
      if (!milestone) form.reset();
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to save milestone.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="milestone-form"
      aria-label={milestone ? `Edit ${milestone.name}` : "Add milestone"}
      aria-busy={pending}
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label>
        Name
        <input
          name="name"
          required
          maxLength={255}
          defaultValue={milestone?.name}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          maxLength={4000}
          defaultValue={milestone?.description}
        />
      </label>
      <label>
        Due date
        <input
          type="date"
          name="dueDate"
          defaultValue={milestone?.dueDate ?? ""}
        />
      </label>
      <p role="alert">{error}</p>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : milestone ? "Save milestone" : "Add milestone"}
      </button>
    </form>
  );
}

export function MilestoneActions({
  milestone,
  total,
  operator,
  primary,
}: {
  milestone: Milestone;
  total: number;
  operator: boolean;
  primary: boolean;
}): ReactElement {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const remove = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (deleting && !pending) cancel.current?.focus();
  }, [deleting, pending]);
  function dismiss(): void {
    setDeleting(false);
    remove.current?.focus();
  }
  async function act(
    kind: "update" | "approve" | "delete",
    data: unknown = {},
  ): Promise<void> {
    setPending(true);
    setError("");
    try {
      await clientRequest(
        `/api/milestones/${milestone.id}${kind === "approve" ? "/approve" : ""}`,
        kind === "approve" ? "POST" : kind === "delete" ? "DELETE" : "PATCH",
        kind === "approve"
          ? { expectedRevision: milestone.reviewRevision }
          : data,
        z.unknown(),
      );
      setDeleting(false);
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to update milestone.",
      );
      if (kind === "approve") router.refresh();
    } finally {
      setPending(false);
    }
  }
  const next =
    milestone.status === "pending"
      ? "in_progress"
      : milestone.status === "in_progress"
        ? "review"
        : "in_progress";
  return (
    <>
      <div className="actions">
        {operator && (
          <>
            <>
              {milestone.status !== "approved" && (
                <button
                  disabled={pending}
                  onClick={() => {
                    void act("update", { status: next });
                  }}
                >
                  {milestone.status === "pending"
                    ? "Start milestone"
                    : milestone.status === "in_progress"
                      ? "Submit for review"
                      : "Return to in progress"}
                </button>
              )}
              <button
                className="secondary"
                disabled={pending || milestone.position === 0}
                aria-label={`Move ${milestone.name} up`}
                onClick={() => {
                  void act("update", { position: milestone.position - 1 });
                }}
              >
                Move up
              </button>
              <button
                className="secondary"
                disabled={pending || milestone.position === total - 1}
                aria-label={`Move ${milestone.name} down`}
                onClick={() => {
                  void act("update", { position: milestone.position + 1 });
                }}
              >
                Move down
              </button>
            </>
            <button
              ref={remove}
              className="secondary"
              disabled={pending}
              onClick={() => setDeleting(true)}
            >
              Delete milestone
            </button>
          </>
        )}
        {!operator && primary && milestone.status === "review" && (
          <button
            disabled={pending}
            onClick={() => {
              void act("approve");
            }}
          >
            Approve milestone
          </button>
        )}
      </div>
      {deleting && (
        <div
          role="group"
          aria-label={`Delete ${milestone.name}?`}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) dismiss();
          }}
        >
          <p>Delete this milestone?</p>
          <button
            disabled={pending}
            onClick={() => {
              void act("delete");
            }}
          >
            Confirm delete milestone
          </button>{" "}
          <button
            ref={cancel}
            className="secondary"
            disabled={pending}
            onClick={dismiss}
          >
            Cancel
          </button>
        </div>
      )}
      <p role="alert">{error}</p>
    </>
  );
}
