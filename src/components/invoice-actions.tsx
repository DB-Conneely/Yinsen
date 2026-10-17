"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { clientRequest } from "./client-forms";
import type { InvoiceDetail } from "../lib/invoices/queries";
import { budgetInput, minorAmount, formatBudget } from "../lib/money";
import { settlementInput } from "../lib/invoices/validation";

function SettlementForm({
  invoice,
  pending,
  submit,
}: {
  invoice: InvoiceDetail;
  pending: boolean;
  submit: (data: unknown) => Promise<void>;
}): ReactElement {
  const [amount, setAmount] = useState(
    budgetInput(invoice.amount, invoice.currency),
  );
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    try {
      await submit(
        settlementInput.parse({
          amountReceived: minorAmount(amount, invoice.currency),
          paymentMethod: method,
          reference,
        }),
      );
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the settlement details.",
      );
    }
  }
  return (
    <form onSubmit={(event) => void save(event)}>
      <p>
        Confirm receipt of the full{" "}
        {formatBudget(invoice.amount, invoice.currency)}. This records money
        received and releases all versions currently on linked milestones. It
        cannot be reversed here.
      </p>
      <fieldset disabled={pending}>
        <div className="form-grid">
          <label>
            Amount received ({invoice.currency})
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            Payment method
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              {settlementInput.shape.paymentMethod.options.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Payment reference
          <input
            required
            maxLength={500}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Confirm full settlement</button>
      </fieldset>
    </form>
  );
}

export function InvoiceActions({
  invoice,
  email,
  portalUrl,
}: {
  invoice: InvoiceDetail;
  email: boolean;
  portalUrl: string;
}): ReactElement {
  const router = useRouter();
  const [panel, setPanel] = useState<
    "send" | "settle" | "cancel" | "delete" | null
  >(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviewedRevision, setReviewedRevision] = useState("");
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (panel) back.current?.focus();
  }, [panel]);
  async function action(
    kind: "send" | "settle" | "cancel" | "delete",
    data: unknown = {},
  ): Promise<void> {
    setPending(true);
    setError("");
    try {
      await clientRequest(
        `/api/invoices/${invoice.id}${kind === "delete" ? "" : `/${kind}`}`,
        kind === "delete" ? "DELETE" : "POST",
        kind === "send" ? { expectedRevision: reviewedRevision } : data,
        z.unknown(),
      );
      setPanel(null);
      if (kind === "delete") router.push("/dashboard/invoices");
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Request failed. Please retry.",
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  const terminal = invoice.status === "paid" || invoice.status === "settled";
  return (
    <section className="card invoice-action-panel" aria-label="Invoice actions">
      <h2>Manage invoice</h2>
      <div className="actions">
        {invoice.status === "draft" && (
          <>
            <a
              className="button secondary"
              href={`/dashboard/invoices/${invoice.id}/edit`}
            >
              Edit draft
            </a>
            <button
              disabled={pending}
              onClick={() => {
                setReviewedRevision(invoice.revision);
                setPanel("send");
              }}
            >
              {invoice.emailFailed ? "Retry sending invoice" : "Send invoice"}
            </button>
          </>
        )}
        {(invoice.status === "sent" || invoice.status === "overdue") && (
          <button disabled={pending} onClick={() => setPanel("settle")}>
            Record full settlement
          </button>
        )}
        {!terminal && invoice.status !== "cancelled" && (
          <button
            className="secondary"
            disabled={pending}
            onClick={() => setPanel("cancel")}
          >
            Cancel invoice
          </button>
        )}
        {!terminal && (
          <button
            className="secondary"
            disabled={pending}
            onClick={() => setPanel("delete")}
          >
            Delete invoice
          </button>
        )}
      </div>
      {invoice.sentAt !== null && (
        <div className="invoice-share">
          <label>
            Client portal link
            <input readOnly value={portalUrl} />
          </label>
          <button
            className="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(portalUrl).then(
                () => setCopied(true),
                () => setError("Copy the portal link from the field."),
              );
            }}
          >
            {copied ? "Link copied" : "Copy portal link"}
          </button>
          <p className="muted">
            Share privately with this recipient. Their client sign-in is
            required.
          </p>
        </div>
      )}
      {panel && (
        <div
          className="confirmation"
          role="group"
          aria-label={`Confirm invoice ${panel}`}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) setPanel(null);
          }}
        >
          {panel === "settle" ? (
            <SettlementForm
              invoice={invoice}
              pending={pending}
              submit={(data) => action("settle", data)}
            />
          ) : (
            <>
              <p>
                {panel === "send"
                  ? `Issue this invoice and freeze its recipient, currency, items, total and release links? ${email ? "Email will be submitted to the recipient; a failure leaves the draft retryable." : "Email is not configured. Share the portal link after sending."}`
                  : panel === "cancel"
                    ? "Cancel this invoice? It remains in the history and its number cannot be reused."
                    : "Delete this invoice from the lists? Its cancelled record and number remain preserved."}
              </p>
              {panel === "send" && reviewedRevision !== invoice.revision && (
                <p role="alert">
                  The invoice changed. Go back and review its current terms
                  before sending.
                </p>
              )}
              <button
                disabled={
                  pending ||
                  (panel === "send" && reviewedRevision !== invoice.revision)
                }
                onClick={() => void action(panel)}
              >
                Confirm{" "}
                {panel === "send"
                  ? "send"
                  : panel === "cancel"
                    ? "cancellation"
                    : "deletion"}
              </button>
            </>
          )}
          <button
            className="secondary"
            ref={back}
            disabled={pending}
            onClick={() => setPanel(null)}
          >
            Go back
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {invoice.emailFailed && (
        <p role="alert">
          Email submission failed. This invoice is still a draft. Check your
          email configuration, then retry sending.
        </p>
      )}
    </section>
  );
}

export function InvoiceDefaults({
  prefix,
  next,
  instructions,
}: {
  prefix: string;
  next: number;
  instructions: string;
}): ReactElement {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      await clientRequest(
        "/api/invoices/defaults",
        "PATCH",
        {
          invoicePrefix: data.get("prefix"),
          invoiceNextNumber: Number(data.get("next")),
          paymentInstructions: data.get("instructions"),
        },
        z.unknown(),
      );
      setMessage(
        "Invoice defaults saved. Existing invoice identities are unchanged.",
      );
      router.refresh();
    } catch (failure: unknown) {
      setMessage(
        failure instanceof Error ? failure.message : "Unable to save defaults.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="card invoice-defaults">
      <summary>Invoice numbering & payment instructions</summary>
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={pending}>
          <p>
            Numbers are unique and never reused, including cancelled or deleted
            invoices. Changes apply to future invoices. Payment instructions
            freeze when each invoice is sent.
          </p>
          <div className="form-grid">
            <label>
              Invoice prefix
              <input
                name="prefix"
                defaultValue={prefix}
                required
                maxLength={10}
                pattern="[A-Z0-9]{1,10}"
              />
            </label>
            <label>
              Next invoice number
              <input
                name="next"
                defaultValue={next}
                type="number"
                min={1}
                max={2147483646}
                required
              />
            </label>
          </div>
          <label>
            Payment instructions
            <textarea
              name="instructions"
              defaultValue={instructions}
              maxLength={4000}
              rows={3}
            />
          </label>
          <button type="submit">Save invoice defaults</button>
          <p role="status">{message}</p>
        </fieldset>
      </form>
    </details>
  );
}
