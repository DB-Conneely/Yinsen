"use client";
import { useState, useRef, useEffect, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { clientRequest } from "./client-forms";
import type { Project } from "../lib/projects/queries";

export function ProjectActions({
  project,
  operator,
}: {
  project: Project;
  operator: boolean;
}): ReactElement {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"lock" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirm && !pending) cancel.current?.focus();
  }, [confirm, pending]);
  function dismiss(): void {
    setConfirm(null);
    trigger.current?.focus();
  }
  async function action(
    kind: "lock" | "delete" | "pending_lockin" | "paused" | "active",
  ): Promise<void> {
    setPending(true);
    setError("");
    try {
      await clientRequest(
        `/api/projects/${project.id}${kind === "lock" ? "/lock-in" : ""}`,
        kind === "delete" ? "DELETE" : kind === "lock" ? "POST" : "PATCH",
        kind === "lock" || kind === "delete" ? {} : { status: kind },
        z.unknown(),
      );
      setConfirm(null);
      if (kind === "delete") router.push("/dashboard/projects");
      router.refresh();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "Request failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section aria-label="Project actions">
      <div className="actions">
        {operator && (
          <>
            <a
              className="button secondary"
              href={`/dashboard/projects/${project.id}/edit`}
            >
              Edit project and members
            </a>
            {project.status === "draft" && (
              <button
                disabled={pending}
                onClick={() => {
                  void action("pending_lockin");
                }}
              >
                Send for lock-in
              </button>
            )}
            {project.status === "active" && (
              <button
                disabled={pending}
                onClick={() => {
                  void action("paused");
                }}
              >
                Pause project
              </button>
            )}
            {project.status === "paused" && (
              <button
                disabled={pending}
                onClick={() => {
                  void action("active");
                }}
              >
                Resume project
              </button>
            )}
            <button
              ref={trigger}
              disabled={pending}
              className="secondary"
              onClick={() => setConfirm("delete")}
            >
              Delete project
            </button>
          </>
        )}
        {!operator && project.status === "pending_lockin" && (
          <button
            ref={trigger}
            disabled={pending}
            onClick={() => setConfirm("lock")}
          >
            Review and lock in
          </button>
        )}
      </div>
      {confirm && (
        <div
          className="card confirmation"
          role="group"
          aria-label={
            confirm === "lock"
              ? "Confirm project lock-in"
              : "Confirm project deletion"
          }
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) dismiss();
          }}
        >
          <p>
            {confirm === "lock"
              ? "You are confirming the project scope, milestones and budget shown here. Ready to lock it in?"
              : "Delete this project? It disappears from both workspaces. Its history remains preserved."}
          </p>
          <div className="actions">
            <button
              disabled={pending}
              onClick={() => {
                void action(confirm);
              }}
            >
              {confirm === "lock" ? "Confirm lock-in" : "Confirm deletion"}
            </button>
            <button
              ref={cancel}
              disabled={pending}
              className="secondary"
              onClick={dismiss}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <p role="alert">{error}</p>
    </section>
  );
}
