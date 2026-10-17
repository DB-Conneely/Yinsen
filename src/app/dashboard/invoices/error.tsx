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
      <p>Your records are preserved. Check the connection and retry.</p>
      <button onClick={reset}>Retry</button>
    </div>
  );
}
