import type { ReactElement } from "react";
export default function SettingsLoading(): ReactElement {
  return (
    <div className="settings-page" aria-busy="true">
      <h1>Settings</h1>
      <p role="status">Loading your saved settings…</p>
      <div className="card skeleton-block" />
      <div className="card skeleton-block" />
    </div>
  );
}
