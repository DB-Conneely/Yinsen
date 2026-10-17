"use client";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { Message, MessagePage } from "../lib/messages/queries";
import { ProposalEditor } from "./proposal-editor";

function ProposalConfirmation({
  type,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  type: "accept" | "reject";
  pending: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="proposal-dialog"
      ref={dialog}
      aria-label={
        type === "accept"
          ? "Confirm proposal acceptance"
          : "Confirm proposal rejection"
      }
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2>
        {type === "accept" ? "Accept these terms?" : "Decline this proposal?"}
      </h2>
      <p>
        {type === "accept"
          ? "The exact terms on this card become an active project with its ordered milestones. Both parties have agreed; no further lock-in is needed."
          : "This ends this proposal chain without creating a project."}
      </p>
      <p role="alert">{error}</p>
      <div className="actions">
        <button disabled={pending} onClick={onConfirm}>
          {pending
            ? "Saving…"
            : type === "accept"
              ? "Confirm acceptance"
              : "Confirm rejection"}
        </button>
        <button
          autoFocus
          disabled={pending}
          className="secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}

export function ProposalCard({
  message,
  operator,
  submitAction,
}: {
  message: Message;
  operator: boolean;
  submitAction: (input: unknown) => Promise<MessagePage>;
}): ReactElement | null {
  const [mode, setMode] = useState<"accept" | "reject" | "counter" | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const root = useRef<HTMLElement>(null);
  const proposal = message.proposal;
  if (!proposal) return null;
  const terms = proposal.terms;
  const state =
    terms && proposal.latestId !== message.id
      ? `superseded${proposal.state === "pending" ? "" : ` · chain ${proposal.state}`}`
      : proposal.state !== "pending"
        ? proposal.state
        : proposal.canRespond
          ? "awaiting your response"
          : "awaiting the other party";
  function dismiss(): void {
    setMode(null);
    setError("");
    requestId.current = "";
    requestAnimationFrame(() => {
      if (trigger.current?.disabled) root.current?.focus();
      else trigger.current?.focus();
    });
  }
  async function respond(type: "accept" | "reject"): Promise<void> {
    requestId.current ||= crypto.randomUUID();
    setPending(true);
    setError("");
    try {
      await submitAction({
        type,
        requestId: requestId.current,
        proposalId: message.id,
      });
      dismiss();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The response could not be saved. Retry when your connection recovers.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="proposal-card"
      ref={root}
      tabIndex={-1}
      aria-label={
        terms
          ? `${message.type === "counter" ? "Counter-proposal" : "Project proposal"}: ${terms.name}`
          : message.type === "accept"
            ? "Proposal accepted"
            : "Proposal declined"
      }
    >
      <p className="eyebrow">
        {message.type === "counter"
          ? "Counter-proposal"
          : message.type === "proposal"
            ? "Project proposal"
            : message.type === "accept"
              ? "Proposal accepted"
              : "Proposal declined"}
      </p>
      {terms && (
        <>
          <h3>{terms.name}</h3>
          <p className="preserve-lines">{terms.description}</p>
          <p>
            <strong>
              {terms.budget} {terms.currency} minor units
            </strong>
          </p>
          {terms.milestones.length > 0 && (
            <ol>
              {terms.milestones.map((item, index) => (
                <li key={index}>
                  <strong>{item.name}</strong>
                  <p className="preserve-lines">{item.description}</p>
                  {item.dueDate && (
                    <time dateTime={item.dueDate}>Due {item.dueDate}</time>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <p className="status-badge">{state}</p>
      {proposal.projectId && (
        <a
          className="button secondary"
          href={`${operator ? "/dashboard" : "/portal"}/projects/${proposal.projectId}`}
        >
          Open agreed project
        </a>
      )}
      {terms && (
        <div className="actions">
          {(["accept", "counter", "reject"] as const).map((type) => (
            <button
              key={type}
              className={type === "accept" ? "" : "secondary"}
              disabled={!proposal.canRespond || pending}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setMode(type);
                requestId.current = "";
                setError("");
              }}
            >
              {type === "accept"
                ? "Accept"
                : type === "counter"
                  ? "Counter"
                  : "Reject"}
            </button>
          ))}
        </div>
      )}
      {mode === "counter" && terms && (
        <ProposalEditor
          initial={terms}
          proposalId={message.id}
          submitAction={async (input) => {
            const result = await submitAction(input);
            dismiss();
            return result;
          }}
          onCancel={dismiss}
        />
      )}
      {(mode === "accept" || mode === "reject") && (
        <ProposalConfirmation
          type={mode}
          pending={pending}
          error={error}
          onCancel={dismiss}
          onConfirm={() => {
            void respond(mode);
          }}
        />
      )}
    </section>
  );
}
