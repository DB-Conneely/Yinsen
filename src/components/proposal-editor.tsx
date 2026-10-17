"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type FormEvent,
} from "react";
import {
  proposalTerms,
  type ProposalTerms,
} from "../lib/messages/proposal-validators";
import type { MessagePage } from "../lib/messages/queries";

export function ProposalEditor({
  initial,
  proposalId,
  submitAction,
  onCancel,
}: {
  initial: ProposalTerms;
  proposalId?: string;
  submitAction: (input: unknown) => Promise<MessagePage>;
  onCancel: () => void;
}): ReactElement {
  const [terms, setTerms] = useState<ProposalTerms>(initial);
  const [amount, setAmount] = useState(
    proposalId ? String(initial.budget) : "",
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const requestId = useRef("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function changed(): void {
    requestId.current = "";
    setError("");
  }
  function milestone(
    index: number,
    field: "name" | "description" | "dueDate",
    value: string,
  ): void {
    changed();
    setTerms({
      ...terms,
      milestones: terms.milestones.map((item, position) =>
        position === index
          ? { ...item, [field]: field === "dueDate" ? value || null : value }
          : item,
      ),
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = proposalTerms.safeParse({
      ...terms,
      budget: /^[0-9]+$/.test(amount) ? Number(amount) : NaN,
    });
    if (!parsed.success) {
      setError(
        "Enter a project name, a whole-number budget from 0 to 2147483647 in minor units, a three-letter currency and valid milestone terms/dates.",
      );
      return;
    }
    requestId.current ||= crypto.randomUUID();
    setPending(true);
    setError("");
    try {
      await submitAction({
        type: proposalId ? "counter" : "proposal",
        requestId: requestId.current,
        ...(proposalId ? { proposalId } : {}),
        terms: parsed.data,
      });
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Proposal could not be sent. Please retry.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="proposal-dialog"
      aria-labelledby="proposal-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        aria-label={proposalId ? "Counter proposal" : "New proposal"}
        aria-busy={pending}
      >
        <h2 id="proposal-editor-title">
          {proposalId ? "Counter proposal" : "Propose a project"}
        </h2>
        <p>
          Agree the scope here. Acceptance creates an active project for both
          parties.
        </p>
        <fieldset disabled={pending}>
          <label>
            Project name
            <input
              autoFocus
              maxLength={255}
              required
              value={terms.name}
              onChange={(event) => {
                changed();
                setTerms({ ...terms, name: event.target.value });
              }}
            />
          </label>
          <label>
            Description
            <textarea
              maxLength={4000}
              value={terms.description}
              onChange={(event) => {
                changed();
                setTerms({ ...terms, description: event.target.value });
              }}
            />
          </label>
          <div className="form-grid">
            <label>
              Budget in minor units
              <input
                inputMode="numeric"
                required
                value={amount}
                onChange={(event) => {
                  changed();
                  setAmount(event.target.value);
                }}
              />
              <small>
                For example, 12345 means GBP 123.45. Enter a whole number.
              </small>
            </label>
            <label>
              Currency
              <input
                maxLength={3}
                pattern="[A-Z]{3}"
                required
                value={terms.currency}
                onChange={(event) => {
                  changed();
                  setTerms({
                    ...terms,
                    currency: event.target.value.toUpperCase(),
                  });
                }}
              />
            </label>
          </div>
          <h3>Ordered milestones</h3>
          {terms.milestones.map((item, index) => (
            <fieldset key={index} className="proposal-milestone">
              <legend>Milestone {index + 1}</legend>
              <label>
                Milestone {index + 1} name
                <input
                  required
                  maxLength={255}
                  value={item.name}
                  onChange={(event) =>
                    milestone(index, "name", event.target.value)
                  }
                />
              </label>
              <label>
                Milestone {index + 1} description
                <textarea
                  maxLength={4000}
                  value={item.description}
                  onChange={(event) =>
                    milestone(index, "description", event.target.value)
                  }
                />
              </label>
              <label>
                Milestone {index + 1} due date
                <input
                  type="date"
                  value={item.dueDate ?? ""}
                  onChange={(event) =>
                    milestone(index, "dueDate", event.target.value)
                  }
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  changed();
                  setTerms({
                    ...terms,
                    milestones: terms.milestones.filter(
                      (_, position) => position !== index,
                    ),
                  });
                }}
              >
                Remove milestone {index + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={terms.milestones.length >= 200}
            onClick={() => {
              changed();
              setTerms({
                ...terms,
                milestones: [
                  ...terms.milestones,
                  { name: "", description: "", dueDate: null },
                ],
              });
            }}
          >
            Add milestone
          </button>
        </fieldset>
        <p role="alert">{error}</p>
        <div className="actions">
          <button disabled={pending}>
            {pending
              ? "Sending…"
              : proposalId
                ? "Send counter"
                : "Send proposal"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
