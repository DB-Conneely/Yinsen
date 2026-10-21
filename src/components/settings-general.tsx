"use client";
import type { ReactElement } from "react";
import type { Branding } from "../lib/settings";
import { SettingsForm } from "./settings-form";
import { setupSchema } from "../lib/auth/validation";

export function PortalSettings({
  settings,
}: {
  settings: Branding;
}): ReactElement {
  return (
    <SettingsForm
      title="Portal defaults"
      values={(form) => ({ section: "portal", ...Object.fromEntries(form) })}
    >
      <label>
        Welcome message
        <textarea
          name="welcomeText"
          defaultValue={settings.welcomeText}
          required
          maxLength={500}
          rows={3}
        />
      </label>
      <label>
        Default currency
        <select name="defaultCurrency" defaultValue={settings.defaultCurrency}>
          {setupSchema.shape.defaultCurrency
            .unwrap()
            .options.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
        </select>
      </label>
      <p className="field-hint">
        Used for new projects, proposals and invoices. Existing amounts and
        currencies are never converted.
      </p>
    </SettingsForm>
  );
}

export function UpdateSettings({
  enabled,
}: {
  enabled: boolean;
}): ReactElement {
  return (
    <SettingsForm
      title="Update permission"
      values={(form) => ({
        section: "updates",
        allowAutomaticUpdates: form.has("allowAutomaticUpdates"),
      })}
      success="Update permission saved. Saving this preference starts no update."
    >
      <label className="settings-check">
        <input
          name="allowAutomaticUpdates"
          type="checkbox"
          defaultChecked={enabled}
        />
        <span>Allow automatic updates</span>
      </label>
      <p>
        This saves permission only. Saving starts no update. A deployment
        service must be configured separately.
      </p>
      <p className="field-hint">
        Off prevents later update starts; it does not cancel an update already
        underway. Your saved choice is {enabled ? "on" : "off"}.
      </p>
    </SettingsForm>
  );
}
