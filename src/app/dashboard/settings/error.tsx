"use client";
import type { ReactElement } from "react";
export default function SettingsError({
  retry,
}: {
  retry: () => void;
}): ReactElement {
  return (
    <div className="card">
      <p className="eyebrow">Settings</p>
      <h1>Settings are unavailable</h1>
      <p>
        We couldn’t read your saved settings. Check the connection and retry.
      </p>
      <button onClick={retry}>Retry</button>
    </div>
  );
}
