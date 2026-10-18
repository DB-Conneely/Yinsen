"use client";
import type { ReactElement } from "react";
export default function InvoiceError({
  retry,
}: {
  retry: () => void;
}): ReactElement {
  return (
    <div className="card">
      <h1>Invoices are unavailable</h1>
      <p>Your records are preserved. Check the connection and retry.</p>
      <button onClick={retry}>Retry</button>
    </div>
  );
}
