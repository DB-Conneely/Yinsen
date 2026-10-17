"use client";
import { useState, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { clientRequest } from "./client-forms";
import type { PaymentException } from "../lib/stripe/queries";

export function InvoicePay({
  id,
  amount,
}: {
  id: string;
  amount: string;
}): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function pay(): Promise<void> {
    setPending(true);
    setError("");
    try {
      const result = await clientRequest(
        `/api/invoices/${id}/pay`,
        "POST",
        {},
        z.object({ url: z.url() }),
      );
      window.location.assign(result.url);
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to open payment. Please retry.",
      );
      setPending(false);
    }
  }
  return (
    <div className="invoice-pay-control">
      <button disabled={pending} onClick={() => void pay()}>
        {pending ? "Opening secure payment…" : "Pay invoice"}
      </button>
      <p className="field-help">
        {amount} · Secure card payment through Stripe
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function PaymentExceptionAction({
  payment,
}: {
  payment: PaymentException;
}): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      await clientRequest(
        `/api/invoices/${payment.invoiceId}/resolve-payment`,
        "POST",
        { paymentId: payment.paymentId, resolution: data.get("resolution") },
        z.unknown(),
      );
      setMessage("Resolution recorded.");
      router.refresh();
    } catch (failure: unknown) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "Unable to save resolution.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="card invoice-payment-record">
      <h3>{payment.number} · Payment needs review</h3>
      <p>{payment.exception}</p>
      <p>
        Stripe payment reference: <code>{payment.paymentId}</code>
      </p>
      <p>
        Checkout reference: <code>{payment.sessionId}</code>
      </p>
      <p>
        Consult this payment in your Stripe Dashboard and resolve it there.
        Yinsen does not refund payments or change this invoice automatically.
      </p>
      <form onSubmit={(event) => void save(event)}>
        <label>
          External resolution notes
          <textarea
            name="resolution"
            minLength={5}
            maxLength={1000}
            required
            defaultValue={payment.resolution ?? ""}
          />
        </label>
        <button disabled={pending}>
          {pending ? "Saving…" : "Record external resolution"}
        </button>
        <p role="status">{message}</p>
      </form>
    </article>
  );
}

export function CheckoutRecovery({
  invoiceId,
  attemptId,
  initialSessionId,
}: {
  invoiceId: string;
  attemptId: string;
  initialSessionId?: string | null;
}): ReactElement {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function recover(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const sessionId = new FormData(event.currentTarget).get("sessionId");
    try {
      await clientRequest(
        `/api/invoices/${invoiceId}/reconcile`,
        "POST",
        { attemptId, sessionId },
        z.unknown(),
      );
      setMessage(
        "Matching session recovered. Payment still requires Stripe confirmation.",
      );
      router.refresh();
    } catch (failure: unknown) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "Unable to recover session.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={(event) => void recover(event)}>
      <p>
        Locate this attempt in Stripe using metadata{" "}
        <code>attempt_id={attemptId}</code>. An unresolved attempt blocks
        replacement payment.
      </p>
      <label>
        Matching Stripe Checkout session ID
        <input
          name="sessionId"
          required
          pattern="cs_(test_|live_)?[A-Za-z0-9]+"
          defaultValue={initialSessionId ?? ""}
        />
      </label>
      <button disabled={pending}>Recover matching session</button>
      <p role="status">{message}</p>
    </form>
  );
}
