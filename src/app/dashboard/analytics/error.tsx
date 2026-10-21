"use client";
import type { ReactElement } from "react";

export default function AnalyticsError({
  retry,
}: {
  retry: () => void;
}): ReactElement {
  return (
    <div className="card">
      <p className="eyebrow">Analytics</p>
      <h1>Your numbers are unavailable</h1>
      <p>
        We couldn’t read the latest records. Check the connection and retry.
      </p>
      <button onClick={retry}>Retry</button>
    </div>
  );
}
