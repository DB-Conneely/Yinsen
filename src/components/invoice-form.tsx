"use client";
import { useState, type ReactElement, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { InvoiceChoices, InvoiceDetail } from "../lib/invoices/queries";
import {
  invoiceFields,
  invoiceTotals,
  invoiceCurrencies,
} from "../lib/invoices/validation";
import { minorAmount, budgetInput, formatBudget } from "../lib/money";
import { clientRequest } from "./client-forms";

type Item = { description: string; quantity: string; unitPrice: string };
function LineItems({
  items,
  setItems,
  currency,
}: {
  items: Item[];
  setItems: (items: Item[]) => void;
  currency: string;
}): ReactElement {
  return (
    <fieldset className="invoice-items">
      <legend>Line items</legend>
      {items.map((item, index) => (
        <div className="invoice-item" key={index}>
          <label>
            Description {index + 1}
            <input
              required
              maxLength={500}
              value={item.description}
              onChange={(event) =>
                setItems(
                  items.map((row, i) =>
                    i === index
                      ? { ...row, description: event.target.value }
                      : row,
                  ),
                )
              }
            />
          </label>
          <label>
            Quantity {index + 1}
            <input
              required
              inputMode="decimal"
              value={item.quantity}
              onChange={(event) =>
                setItems(
                  items.map((row, i) =>
                    i === index
                      ? { ...row, quantity: event.target.value }
                      : row,
                  ),
                )
              }
            />
          </label>
          <label>
            Unit price {index + 1} ({currency})
            <input
              required
              inputMode="decimal"
              value={item.unitPrice}
              onChange={(event) =>
                setItems(
                  items.map((row, i) =>
                    i === index
                      ? { ...row, unitPrice: event.target.value }
                      : row,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={items.length === 1}
            onClick={() => setItems(items.filter((_, i) => i !== index))}
            aria-label={`Remove item ${index + 1}`}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={items.length >= 100}
        onClick={() =>
          setItems([
            ...items,
            { description: "", quantity: "1", unitPrice: "" },
          ])
        }
      >
        Add line item
      </button>
      <p className="muted">
        Quantities allow two decimal places. Each line rounds half up to the
        smallest currency unit.
      </p>
    </fieldset>
  );
}

export function InvoiceForm({
  choices,
  currency: defaultCurrency,
  invoice,
}: {
  choices: InvoiceChoices;
  currency: string;
  invoice?: InvoiceDetail;
}): ReactElement {
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [expectedRevision] = useState(invoice?.revision);
  const [clientId, setClientId] = useState(invoice?.clientId ?? "");
  const [projectId, setProjectId] = useState(invoice?.projectId ?? "");
  const [currency, setCurrency] = useState(
    invoice?.currency ?? defaultCurrency,
  );
  const [items, setItems] = useState<Item[]>(
    invoice?.lineItems.map((item) => ({
      description: item.description,
      quantity: String(item.quantityHundredths / 100),
      unitPrice: budgetInput(item.unitPrice, invoice.currency),
    })) ?? [{ description: "", quantity: "1", unitPrice: "" }],
  );
  const [milestoneIds, setMilestoneIds] = useState(
    invoice?.milestones.map((item) => item.id) ?? [],
  );
  const [override, setOverride] = useState(
    invoice ? budgetInput(invoice.totalOverride, invoice.currency) : "",
  );
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? "");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function fields(): z.infer<typeof invoiceFields> {
    return invoiceFields.parse({
      clientId,
      projectId: projectId || null,
      currency,
      dueDate: dueDate || null,
      notes,
      milestoneIds,
      totalOverride: minorAmount(override, currency),
      lineItems: items.map((item) => ({
        ...item,
        unitPrice: minorAmount(item.unitPrice, currency),
      })),
    });
  }
  let total = "Complete the items to calculate your total";
  try {
    total = formatBudget(invoiceTotals(fields()).amount, currency);
  } catch {
    /* Incomplete input has no valid total yet. */
  }
  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await clientRequest(
        invoice ? `/api/invoices/${invoice.id}` : "/api/invoices",
        invoice ? "PATCH" : "POST",
        {
          ...fields(),
          ...(invoice ? { expectedRevision } : { requestId }),
        },
        z.object({ id: z.uuid() }),
      );
      router.push(`/dashboard/invoices/${saved.id}`);
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to save invoice. Your draft is kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card invoice-form" onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy}>
        <legend>{invoice ? "Edit draft" : "Invoice details"}</legend>
        <div className="form-grid">
          <label>
            Recipient
            <select
              required
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                setProjectId("");
                setMilestoneIds([]);
              }}
            >
              <option value="">Choose a client</option>
              {choices.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} · {client.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project
            <select
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setMilestoneIds([]);
              }}
            >
              <option value="">Standalone invoice</option>
              {choices.projects
                .filter((project) => project.clientIds.includes(clientId))
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Currency
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {invoiceCurrencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
        </div>
        <LineItems items={items} setItems={setItems} currency={currency} />
        <div className="invoice-total">
          <label>
            Total override ({currency}, optional)
            <input
              inputMode="decimal"
              value={override}
              onChange={(event) => setOverride(event.target.value)}
            />
          </label>
          <strong aria-live="polite">Total: {total}</strong>
        </div>
        <fieldset>
          <legend>Automatic file release</legend>
          <p>
            The first full payment or settlement of{" "}
            <strong>any linked invoice</strong> releases{" "}
            <strong>all versions then present</strong> on these milestones.
            Other invoices may remain unpaid. Later uploads stay locked. Choose
            no milestones to control release manually.
          </p>
          <div className="member-options">
            {choices.milestones
              .filter((milestone) => milestone.projectId === projectId)
              .map((milestone) => (
                <label className="checkbox" key={milestone.id}>
                  <input
                    type="checkbox"
                    checked={milestoneIds.includes(milestone.id)}
                    onChange={(event) =>
                      setMilestoneIds(
                        event.target.checked
                          ? [...milestoneIds, milestone.id]
                          : milestoneIds.filter((id) => id !== milestone.id),
                      )
                    }
                  />
                  {milestone.name}
                </label>
              ))}
          </div>
          {!projectId && (
            <p className="muted">Choose a project to link milestones.</p>
          )}
        </fieldset>
        <label>
          Notes
          <textarea
            maxLength={4000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit">{busy ? "Saving…" : "Save draft"}</button>
        </div>
        <p className="muted">
          Review the saved preview before sending. Sending freezes financial
          terms and release links.
        </p>
      </fieldset>
    </form>
  );
}
