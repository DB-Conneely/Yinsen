"use client";
import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";

type Preference = "system" | "light" | "dark";
let memoryPreference: Preference = "system";
let memoryOnly = false;
function preference(): Preference {
  if (memoryOnly) return memoryPreference;
  try {
    const value = localStorage.getItem("yinsen-theme");
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return memoryPreference;
  }
}
function applyPreference(): void {
  const value = preference();
  document.documentElement.dataset.theme =
    value === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : value;
}
function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("appearancechange", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("appearancechange", callback);
  };
}
function serverPreference(): Preference {
  return "system";
}

export function ThemeToggle(): ReactElement {
  const [unsaved, setUnsaved] = useState(memoryOnly);
  const value = useSyncExternalStore(subscribe, preference, serverPreference);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  useLayoutEffect(() => {
    applyPreference();
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyPreference);
    window.addEventListener("storage", applyPreference);
    return () => {
      media.removeEventListener("change", applyPreference);
      window.removeEventListener("storage", applyPreference);
    };
  }, []);
  return (
    <label className="theme-toggle">
      <span>Appearance</span>
      <select
        aria-label="Appearance"
        disabled={!ready}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (next !== "light" && next !== "dark" && next !== "system") return;
          memoryPreference = next;
          try {
            localStorage.setItem("yinsen-theme", next);
            memoryOnly = false;
            setUnsaved(false);
          } catch {
            memoryOnly = true;
            setUnsaved(true);
          }
          applyPreference();
          window.dispatchEvent(new Event("appearancechange"));
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      {unsaved && (
        <span
          className="theme-warning"
          role="status"
          title="Browser storage is unavailable. This choice applies to this tab until reload."
        >
          Not saved
        </span>
      )}
    </label>
  );
}
