import type { ReactElement } from "react";

export default function DashboardLoading(): ReactElement {
  return (
    <div className="card analytics-loading" role="status">
      <p className="eyebrow">Your workspace</p>
      <h1>Reading the latest records…</h1>
      <p>Gathering your projects, payments and conversations.</p>
    </div>
  );
}
