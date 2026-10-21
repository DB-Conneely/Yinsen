import type { ReactElement } from "react";

export default function AnalyticsLoading(): ReactElement {
  return (
    <div className="card analytics-loading" role="status">
      <p className="eyebrow">Analytics</p>
      <h1>Reading the latest numbers…</h1>
      <p>Gathering received payments, projects and client activity.</p>
    </div>
  );
}
