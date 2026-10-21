import type { ReactElement, CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AppError } from "../lib/errors";
import { type ProjectActor } from "../lib/projects/access";
import {
  getInvoice,
  listInvoices,
  invoiceChoices,
  type InvoiceDetail,
} from "../lib/invoices/queries";
import { invoiceStatus } from "../lib/invoices/validation";
import { getBranding, getOperatorSettings } from "../lib/settings";
import { appearanceStyle, defaultAppearance } from "../lib/appearance";
import { readConfiguration } from "../lib/config";
import { formatBudget } from "../lib/money";
import { ProjectLive } from "./project-live";
import { InvoiceActions, InvoiceDefaults } from "./invoice-actions";
import { InvoiceForm } from "./invoice-form";
import {
  InvoicePay,
  CheckoutRecovery,
  PaymentExceptionAction,
} from "./invoice-payment";
import { paymentExceptions, checkoutProblems } from "../lib/stripe/queries";
import { invoiceAttempts } from "../lib/stripe/checkout";
import { getSql } from "../lib/db/client";

async function detail(id: string, actor: ProjectActor): Promise<InvoiceDetail> {
  try {
    return await getInvoice(id, actor);
  } catch (error: unknown) {
    if (error instanceof AppError && error.statusCode === 404) notFound();
    throw error;
  }
}

export async function InvoiceList({
  actor,
  status,
}: {
  actor: ProjectActor;
  status?: string;
}): Promise<ReactElement> {
  const parsed = invoiceStatus.safeParse(status);
  const invoices = await listInvoices(
    actor,
    parsed.success ? { status: parsed.data } : {},
  );
  const branding =
    actor.role === "operator" ? await getOperatorSettings(actor) : null;
  const exceptions =
    actor.role === "operator" ? await paymentExceptions(actor) : [];
  const problems =
    actor.role === "operator" ? await checkoutProblems(actor) : [];
  const root =
    actor.role === "operator" ? "/dashboard/invoices" : "/portal/invoices";
  return (
    <ProjectLive>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Billing</p>
          <h1>Invoices</h1>
          <p>
            {actor.role === "operator"
              ? "Clear terms, payment records and file release."
              : "Your invoices and payment instructions."}
          </p>
        </div>
        {actor.role === "operator" && (
          <Link className="button" href={`${root}/new`}>
            New invoice
          </Link>
        )}
      </div>
      <form method="get" className="card project-filter">
        <label>
          Status
          <select
            name="status"
            defaultValue={parsed.success ? parsed.data : ""}
          >
            <option value="">All invoices</option>
            {invoiceStatus.options
              .filter((value) => actor.role === "operator" || value !== "draft")
              .map((value) => (
                <option key={value}>{value}</option>
              ))}
          </select>
        </label>
        <button type="submit">Filter invoices</button>
      </form>
      {invoices.length ? (
        <div className="invoice-list">
          {invoices.map((invoice) => (
            <Link
              className="card invoice-list-row"
              key={invoice.id}
              href={`${root}/${invoice.id}`}
            >
              <div>
                <span className="eyebrow">{invoice.number}</span>
                <h2>{invoice.recipientName}</h2>
                <p>
                  {invoice.dueDate ? `Due ${invoice.dueDate}` : "No due date"}
                </p>
              </div>
              <div className="invoice-list-amount">
                <strong>
                  {formatBudget(invoice.amount, invoice.currency)}
                </strong>
                <span className="status-badge" data-status={invoice.status}>
                  {invoice.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card">
          <h2>No invoices yet</h2>
          <p>
            {parsed.success
              ? "No invoices match this status."
              : "Invoices will appear here when they are ready."}
          </p>
        </div>
      )}
      {branding && (
        <InvoiceDefaults
          prefix={branding.invoicePrefix}
          next={branding.invoiceNextNumber}
          instructions={branding.paymentInstructions}
        />
      )}
      {problems.length > 0 && (
        <section aria-label="Checkout needs review">
          <h2>Checkout needs review</h2>
          {problems.map((attempt) => (
            <article className="card invoice-payment-record" key={attempt.id}>
              <h3>{attempt.number} · Checkout needs review</h3>
              <p role="alert">
                {attempt.problem ??
                  "Session expiration could not be confirmed. Consult Stripe before arranging another payment."}
              </p>
              <CheckoutRecovery
                invoiceId={attempt.invoiceId}
                attemptId={attempt.id}
                initialSessionId={attempt.sessionId}
              />
            </article>
          ))}
        </section>
      )}
      {exceptions.length > 0 && (
        <section aria-label="Payment exceptions">
          <h2>Payment exceptions</h2>
          {exceptions.map((payment) => (
            <PaymentExceptionAction key={payment.paymentId} payment={payment} />
          ))}
        </section>
      )}
    </ProjectLive>
  );
}

export function InvoicePreview({
  invoice,
}: {
  invoice: InvoiceDetail;
}): ReactElement {
  return (
    <article
      className="card invoice-preview appearance-surface"
      // CAST: the persisted invoice colour is constrained to a six-digit hex value.
      style={
        {
          ...appearanceStyle(
            invoice.issuerDetails ?? defaultAppearance,
            invoice.brandColour,
          ),
          "--brand-colour": invoice.brandColour,
        } as CSSProperties
      }
      aria-label="Invoice preview"
    >
      <div className="invoice-preview-heading">
        <div>
          <p className="eyebrow">From</p>
          {invoice.issuerDetails?.logoId && (
            <Image
              unoptimized
              className="invoice-logo"
              src={`/api/branding/logo/${invoice.issuerDetails.logoId}`}
              alt={`${invoice.issuerName} logo`}
              width={64}
              height={64}
            />
          )}
          <h2>{invoice.issuerName}</h2>
          <p>{invoice.issuerEmail}</p>
          {invoice.issuerDetails && (
            <>
              <p>{invoice.issuerDetails.contactPhone}</p>
              <p className="preserve-lines">
                {invoice.issuerDetails.businessAddress}
              </p>
              <p>{invoice.issuerDetails.website}</p>
            </>
          )}
        </div>
        <div>
          <p className="eyebrow">Invoice</p>
          <h2>{invoice.number}</h2>
          <span className="status-badge" data-status={invoice.status}>
            {invoice.status}
          </span>
        </div>
      </div>
      <div className="form-grid">
        <div>
          <p className="eyebrow">Bill to</p>
          <strong>{invoice.recipientName}</strong>
          <p>{invoice.recipientEmail}</p>
        </div>
        <div>
          <p className="eyebrow">Due date</p>
          <p>{invoice.dueDate ?? "Not specified"}</p>
        </div>
      </div>
      <div className="invoice-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item, index) => (
              <tr key={index}>
                <td>{item.description}</td>
                <td>{item.quantityHundredths / 100}</td>
                <td>{formatBudget(item.unitPrice, invoice.currency)}</td>
                <td>{formatBudget(item.amount, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invoice.totalOverride !== null && (
        <p className="muted">
          Agreed total override; line items are shown for reference.
        </p>
      )}
      <p className="invoice-grand-total">
        Total <strong>{formatBudget(invoice.amount, invoice.currency)}</strong>
      </p>
      {invoice.notes && (
        <section>
          <h3>Notes</h3>
          <p className="preserve-lines">{invoice.notes}</p>
        </section>
      )}
      {(invoice.status === "sent" || invoice.status === "overdue") && (
        <section>
          <h3>Payment instructions</h3>
          <p className="preserve-lines">
            {invoice.paymentInstructions ||
              "Contact the operator to arrange payment. Include the invoice number as your reference."}
          </p>
        </section>
      )}
      {invoice.settlementData && (
        <section>
          <h3>Payment recorded</h3>
          <p>
            {formatBudget(
              invoice.settlementData.amountReceived,
              invoice.currency,
            )}{" "}
            · {invoice.settlementData.paymentMethod.replaceAll("_", " ")}
          </p>
          <p>Reference: {invoice.settlementData.reference}</p>
        </section>
      )}
      {invoice.milestones.length > 0 && (
        <section>
          <h3>File release milestones</h3>
          <p>
            {invoice.milestones.map((milestone) => milestone.name).join(" · ")}
          </p>
          <p className="muted">
            Full payment of any linked invoice releases all versions then
            present. Later uploads remain pending release.
          </p>
        </section>
      )}
    </article>
  );
}

export async function InvoiceWorkspace({
  id,
  actor,
}: {
  id: string;
  actor: ProjectActor;
}): Promise<ReactElement> {
  const invoice = await detail(id, actor);
  return (
    <ProjectLive>
      <div className="page-heading">
        <div>
          <Link
            className="back-link"
            href={
              actor.role === "operator"
                ? "/dashboard/invoices"
                : "/portal/invoices"
            }
          >
            ← Invoices
          </Link>
          <h1>{invoice.number}</h1>
          <p>
            {invoice.status === "draft"
              ? "Review your draft before issuing it."
              : "Invoice terms and confirmed payment record."}
          </p>
        </div>
        {actor.role === "client" &&
          readConfiguration().stripe &&
          ["sent", "overdue"].includes(invoice.status) && (
            <InvoicePay
              id={invoice.id}
              amount={formatBudget(invoice.amount, invoice.currency)}
            />
          )}
      </div>
      <InvoicePreview invoice={invoice} />
      {actor.role === "operator" &&
        (await invoiceAttempts(getSql(), invoice.id)).map((attempt) => (
          <section className="card invoice-payment-record" key={attempt.id}>
            <h2>Stripe Checkout · {attempt.state}</h2>
            <p>
              Attempt: <code>{attempt.id}</code>
            </p>
            {attempt.sessionId && (
              <p>
                Session: <code>{attempt.sessionId}</code>
              </p>
            )}
            {attempt.problem && <p role="alert">{attempt.problem}</p>}
            {!attempt.sessionId && (
              <CheckoutRecovery invoiceId={invoice.id} attemptId={attempt.id} />
            )}
          </section>
        ))}
      {actor.role === "operator" &&
        (await paymentExceptions(actor))
          .filter((payment) => payment.invoiceId === invoice.id)
          .map((payment) => (
            <PaymentExceptionAction key={payment.paymentId} payment={payment} />
          ))}
      {actor.role === "operator" && (
        <InvoiceActions
          invoice={invoice}
          email={Boolean(readConfiguration().email)}
          portalUrl={`${readConfiguration().origin}/portal/invoices/${invoice.id}`}
        />
      )}
    </ProjectLive>
  );
}

export async function InvoiceEditor({
  actor,
  id,
}: {
  actor: ProjectActor;
  id?: string;
}): Promise<ReactElement> {
  const invoice = id ? await detail(id, actor) : undefined;
  if (invoice && invoice.status !== "draft")
    return (
      <div className="card">
        <h1>Invoice terms are frozen</h1>
        <p>
          Cancel and reissue an unpaid invoice to change its financial terms.
        </p>
        <Link href={`/dashboard/invoices/${id}`}>Return to invoice</Link>
      </div>
    );
  const branding = await getBranding();
  return (
    <>
      <div className="page-heading">
        <div>
          <Link href="/dashboard/invoices" className="back-link">
            ← Invoices
          </Link>
          <h1>{invoice ? `Edit ${invoice.number}` : "New invoice"}</h1>
          <p>
            Set the charge and choose whether payment releases project files.
          </p>
        </div>
      </div>
      <InvoiceForm
        choices={await invoiceChoices(actor)}
        currency={branding?.defaultCurrency ?? "GBP"}
        {...(invoice ? { invoice } : {})}
      />
    </>
  );
}
