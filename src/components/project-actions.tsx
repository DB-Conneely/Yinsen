"use client";
import {
  useState,
  useRef,
  useEffect,
  type ReactElement,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { clientRequest } from "./client-forms";
import type { ProjectDetail } from "../lib/projects/queries";

type Confirmation =
  "lock" | "delete" | "submit-for-approval" | "accept" | "dispute" | "archive";
type Action = Confirmation | "pending_lockin" | "paused" | "active";
type Control = { kind: Action; label: string; secondary?: boolean };
const confirmations = {
  lock: {
    title: "Confirm project lock-in",
    button: "Confirm lock-in",
    copy: "You are confirming the scope, milestones and budget shown here. Ready to start?",
  },
  delete: {
    title: "Confirm project deletion",
    button: "Confirm deletion",
    copy: "Delete this project? It disappears from both workspaces. Its history remains preserved.",
  },
  "submit-for-approval": {
    title: "Submit project for completion",
    button: "Confirm submission",
    copy: "Ask the primary client to review the current work and accept completion. This does not change invoices or release files.",
  },
  accept: {
    title: "Accept project completion",
    button: "Confirm acceptance",
    copy: "Confirm that the delivered work is complete. The project and its shared history stay available. Invoice payments and file release remain separate.",
  },
  dispute: {
    title: "Request changes to the work",
    button: "Send dispute",
    copy: "Explain what still needs attention. Your reason will be saved in the project conversation for everyone, and the project returns to active work.",
  },
  archive: {
    title: "Archive completed project",
    button: "Confirm archive",
    copy: "File this completed project away. Members keep access to its history and released files. Invoices and payments remain available to their recipient.",
  },
};
const notices: Partial<Record<Action, string>> = {
  dispute: "Changes requested. Your reason is saved in the conversation below.",
  accept: "Completion accepted.",
  archive: "Project archived.",
  "submit-for-approval": "Submitted for the primary client’s review.",
};
function reviewRevision(
  project: ProjectDetail,
  kind: Confirmation | null,
): string {
  return kind === "lock" ? project.lockRevision : project.completionRevision;
}
function directAction(
  kind: Action,
): kind is "pending_lockin" | "paused" | "active" {
  return kind === "pending_lockin" || kind === "paused" || kind === "active";
}
async function requestAction(
  project: ProjectDetail,
  kind: Action,
  expectedRevision: string,
  reason: string,
): Promise<void> {
  const direct = directAction(kind);
  await clientRequest(
    `/api/projects/${project.id}${direct || kind === "delete" ? "" : kind === "lock" ? "/lock-in" : `/${kind}`}`,
    kind === "delete" ? "DELETE" : direct ? "PATCH" : "POST",
    direct
      ? { status: kind }
      : kind === "delete"
        ? {}
        : { expectedRevision, ...(kind === "dispute" ? { reason } : {}) },
    z.unknown(),
  );
}
function lifecycleCopy(
  project: ProjectDetail,
  operator: boolean,
  primary: boolean,
): { title: string; copy: string } {
  if (project.status === "pending_approval")
    return {
      title: "Ready for a final review",
      copy: operator
        ? "Waiting for the primary client to accept completion or explain what needs attention."
        : primary
          ? "Review the scope, milestones and delivered files. Accept completion or send a reason to request changes."
          : "The primary client reviews completion. You can still view the work and join the conversation.",
    };
  if (project.status === "completed")
    return {
      title: "Work accepted",
      copy: operator
        ? "The primary client accepted completion. Archive the project when you are ready to file it away."
        : "This project is complete. Your conversation, invoices and permitted files stay available.",
    };
  if (project.status === "archived")
    return {
      title: "Project archived",
      copy: "The completed project remains available as a shared record. File permissions and invoice payments still apply.",
    };
  return {
    title: "Project actions",
    copy:
      project.status === "active"
        ? operator
          ? "Keep work moving, or submit the finished project for the primary client’s review."
          : "Work is active. The operator will submit the finished project for the primary client’s review."
        : project.status === "paused"
          ? "Work is paused. Resume when you are ready to continue."
          : "Review the agreed scope and milestones before starting work.",
  };
}
type DialogState = {
  confirm: Confirmation | null;
  error: string;
  notice: string;
  pending: boolean;
  reason: string;
  reviewedRevision: string;
};
const initialState: DialogState = {
  confirm: null,
  error: "",
  notice: "",
  pending: false,
  reason: "",
  reviewedRevision: "",
};
type ProjectDialog = {
  state: DialogState;
  setState: Dispatch<SetStateAction<DialogState>>;
  open: (kind: Confirmation, button: HTMLButtonElement) => void;
  dismiss: () => void;
  stale: boolean;
};
type Model = ProjectDialog & { action: (kind: Action) => Promise<void> };
function useProjectDialog(
  project: ProjectDetail,
  focusRoot: () => void,
): ProjectDialog {
  const [state, setState] = useState(initialState);
  const trigger = useRef<HTMLButtonElement | null>(null);
  function open(kind: Confirmation, button: HTMLButtonElement): void {
    trigger.current = button;
    setState((old) => ({
      ...old,
      confirm: kind,
      reviewedRevision: reviewRevision(project, kind),
      error: "",
      notice: "",
    }));
  }
  function dismiss(): void {
    setState((old) => ({ ...old, confirm: null, error: "" }));
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected && !trigger.current.disabled)
        trigger.current.focus();
      else focusRoot();
    });
  }
  return {
    state,
    setState,
    open,
    dismiss,
    stale:
      state.confirm !== "delete" &&
      state.reviewedRevision !== reviewRevision(project, state.confirm),
  };
}
function useProjectActions(
  project: ProjectDetail,
  focusRoot: () => void,
): Model {
  const dialog = useProjectDialog(project, focusRoot);
  const router = useRouter();
  async function action(kind: Action): Promise<void> {
    dialog.setState((old) => ({
      ...old,
      pending: true,
      error: "",
      notice: "",
    }));
    try {
      await requestAction(
        project,
        kind,
        dialog.state.reviewedRevision,
        dialog.state.reason,
      );
      dialog.setState({
        ...initialState,
        pending: true,
        notice: notices[kind] ?? "Project updated.",
      });
      if (kind === "delete") router.push("/dashboard/projects");
      router.refresh();
    } catch (failure: unknown) {
      dialog.setState((old) => ({
        ...old,
        error:
          failure instanceof Error
            ? failure.message
            : "Request failed. Please retry.",
      }));
      router.refresh();
    } finally {
      dialog.setState((old) => ({ ...old, pending: false }));
    }
  }
  return { ...dialog, action };
}
function controls(
  status: ProjectDetail["status"],
  operator: boolean,
  primary: boolean,
): Control[] {
  if (operator) {
    if (status === "active")
      return [
        { kind: "submit-for-approval", label: "Submit for completion" },
        { kind: "paused", label: "Pause project", secondary: true },
      ];
    if (status === "draft")
      return [{ kind: "pending_lockin", label: "Send for lock-in" }];
    if (status === "paused")
      return [{ kind: "active", label: "Resume project" }];
    if (status === "completed")
      return [{ kind: "archive", label: "Archive project" }];
  } else {
    if (status === "pending_lockin")
      return [{ kind: "lock", label: "Review and lock in" }];
    if (status === "pending_approval" && primary)
      return [
        { kind: "accept", label: "Accept completion" },
        { kind: "dispute", label: "Request changes", secondary: true },
      ];
  }
  return [];
}
function ActionButton({
  control,
  model,
}: {
  control: Control;
  model: Model;
}): ReactElement {
  return (
    <button
      disabled={model.state.pending}
      className={control.secondary ? "secondary" : undefined}
      onClick={(event) => {
        if (directAction(control.kind)) void model.action(control.kind);
        else model.open(control.kind, event.currentTarget);
      }}
    >
      {control.label}
    </button>
  );
}
function DisputeReason({ model }: { model: Model }): ReactElement {
  return (
    <label>
      Reason for requesting changes
      <textarea
        value={model.state.reason}
        onChange={(event) =>
          model.setState((old) => ({ ...old, reason: event.target.value }))
        }
        minLength={10}
        maxLength={4000}
        rows={4}
        required
        disabled={model.state.pending}
        aria-describedby="dispute-help"
      />
      <span id="dispute-help" className="field-help">
        At least 10 characters. Be specific about the changes you need.
      </span>
    </label>
  );
}
function ConfirmationButtons({
  model,
  kind,
  cancel,
}: {
  model: Model;
  kind: Confirmation;
  cancel: React.RefObject<HTMLButtonElement | null>;
}): ReactElement {
  return (
    <div className="actions">
      <button
        disabled={
          model.state.pending ||
          model.stale ||
          (kind === "dispute" && model.state.reason.trim().length < 10)
        }
        onClick={() => {
          void model.action(kind);
        }}
      >
        {model.state.pending ? "Saving…" : confirmations[kind].button}
      </button>
      <button
        ref={cancel}
        disabled={model.state.pending}
        className="secondary"
        onClick={model.dismiss}
      >
        Cancel
      </button>
    </div>
  );
}

function ProjectConfirmation({
  model,
  kind,
}: {
  model: Model;
  kind: Confirmation;
}): ReactElement {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, [kind]);
  return (
    <div
      className="confirmation"
      role="group"
      aria-label={confirmations[kind].title}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !model.state.pending) model.dismiss();
      }}
    >
      <h3>{confirmations[kind].title}</h3>
      <p>{confirmations[kind].copy}</p>
      {kind === "dispute" && <DisputeReason model={model} />}
      {model.stale && (
        <p role="alert">
          The project changed while this confirmation was open. Cancel and
          review the current work before confirming again. Your reason is kept.
        </p>
      )}
      <ConfirmationButtons model={model} kind={kind} cancel={cancel} />
    </div>
  );
}
function ProjectFeedback({ model }: { model: Model }): ReactElement {
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (model.state.notice) feedback.current?.focus();
  }, [model.state.notice]);
  return (
    <>
      {model.state.error && (
        <p role="alert" className="error-message">
          {model.state.error}
        </p>
      )}
      <p role="status" ref={feedback} tabIndex={-1}>
        {model.state.notice}
      </p>
    </>
  );
}
function ProjectManagement({
  project,
  model,
}: {
  project: ProjectDetail;
  model: Model;
}): ReactElement {
  return (
    <div className="actions project-management">
      <a
        className="button secondary"
        href={`/dashboard/projects/${project.id}/edit`}
      >
        Edit project and members
      </a>
      <ActionButton
        control={{ kind: "delete", label: "Delete project", secondary: true }}
        model={model}
      />
    </div>
  );
}
export function ProjectActions({
  project,
  operator,
  primary = false,
}: {
  project: ProjectDetail;
  operator: boolean;
  primary?: boolean;
}): ReactElement {
  const root = useRef<HTMLElement>(null);
  const model = useProjectActions(project, () => root.current?.focus());
  const copy = lifecycleCopy(project, operator, primary);
  return (
    <section
      className="card project-lifecycle"
      ref={root}
      tabIndex={-1}
      aria-label="Project actions"
      aria-busy={model.state.pending}
    >
      <div>
        <p className="eyebrow">Next step</p>
        <h2>{copy.title}</h2>
        <p>{copy.copy}</p>
      </div>
      <div className="actions">
        {controls(project.status, operator, primary).map((control) => (
          <ActionButton key={control.kind} control={control} model={model} />
        ))}
      </div>
      {model.state.confirm && (
        <ProjectConfirmation model={model} kind={model.state.confirm} />
      )}
      <ProjectFeedback model={model} />
      {operator && <ProjectManagement project={project} model={model} />}
    </section>
  );
}
