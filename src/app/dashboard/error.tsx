"use client";
import type { ReactElement } from "react";

export default function DashboardError({
  retry,
}: {
  retry: () => void;
}): ReactElement {
  return (
    <div className="card">
      <p className="eyebrow">Overview</p>
      <h1>Your overview is unavailable</h1>
      <p>
        We couldn’t read the latest records. Check the connection and retry.
      </p>
      <button onClick={retry}>Retry</button>
    </div>
  );
}
