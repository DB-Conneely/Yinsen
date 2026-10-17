"use client";
import type { ReactElement } from "react";
export default function InvoiceError({
  reset,
}: {
  reset: () => void;
}): ReactElement {
  return (
    <div className="card">
      <h1>Invoices are unavailable</h1>
      <p>Check your connection and retry, or contact the operator.</p>
      <button onClick={reset}>Retry</button>
    </div>
  );
}
