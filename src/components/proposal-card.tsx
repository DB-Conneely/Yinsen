"use client";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { Message, MessagePage } from "../lib/messages/queries";
import { proposalAction } from "../lib/messages/proposal-validators";
import { ProposalEditor } from "./proposal-editor";
import { formatBudget } from "../lib/money";

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
  onSaved,
}: {
  message: Message;
  operator: boolean;
  submitAction: (input: unknown) => Promise<MessagePage>;
  onSaved: (requestId: string) => void;
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
  function dismiss(confirmedId?: string): void {
    setMode(null);
    setError("");
    requestId.current = "";
    if (confirmedId) onSaved(confirmedId);
    else
      requestAnimationFrame(() => {
        if (!trigger.current?.isConnected || trigger.current.disabled)
          root.current?.focus();
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
      dismiss(requestId.current);
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
      <div className="proposal-heading">
        <p className="eyebrow">
          {message.type === "counter"
            ? "Counter-proposal"
            : message.type === "proposal"
              ? "Project proposal"
              : message.type === "accept"
                ? "Proposal accepted"
                : "Proposal declined"}
        </p>
        <span className="status-badge" data-status={proposal.state}>
          {state}
        </span>
      </div>
      {terms && (
        <>
          <h3>{terms.name}</h3>
          <p className="preserve-lines">{terms.description}</p>
          <div className="proposal-budget">
            <span>Project budget</span>
            <strong>
              {formatBudget(terms.budget, terms.currency)} {terms.currency}
            </strong>
          </div>
          {terms.milestones.length > 0 && (
            <div className="proposal-milestones">
              <h4>
                Milestones <span>{terms.milestones.length}</span>
              </h4>
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
            </div>
          )}
        </>
      )}
      {proposal.projectId && (
        <div className="proposal-footer">
          <a
            className="button secondary"
            href={`${operator ? "/dashboard" : "/portal"}/projects/${proposal.projectId}`}
          >
            Open agreed project
          </a>
        </div>
      )}
      {terms && proposal.canRespond && (
        <div className="actions">
          {(["accept", "counter", "reject"] as const).map((type) => (
            <button
              key={type}
              className={type === "accept" ? "" : "secondary"}
              disabled={pending}
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
            dismiss(proposalAction.parse(input).requestId);
            return result;
          }}
          onCancel={() => dismiss()}
        />
      )}
      {(mode === "accept" || mode === "reject") && (
        <ProposalConfirmation
          type={mode}
          pending={pending}
          error={error}
          onCancel={() => dismiss()}
          onConfirm={() => {
            void respond(mode);
          }}
        />
      )}
    </section>
  );
}
