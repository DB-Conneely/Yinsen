"use client";
import { useRef, useState, type ReactElement, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { Branding } from "../lib/settings";
import {
  appearanceSchema,
  appearanceStyle,
  appearanceGuidance,
  palettes,
  type Appearance,
} from "../lib/appearance";
import { SettingsForm } from "./settings-form";
import { clientRequest } from "./client-forms";

export function BrandingSettings({
  settings,
}: {
  settings: Branding;
}): ReactElement {
  const [colour, setColour] = useState(settings.brandColour);
  const [previewColour, setPreviewColour] = useState(settings.brandColour);
  return (
    <SettingsForm
      title="Branding"
      values={(form) => ({ section: "branding", ...Object.fromEntries(form) })}
    >
      <div className="form-grid">
        <label>
          Brand name
          <input
            name="brandName"
            defaultValue={settings.brandName}
            required
            maxLength={100}
          />
        </label>
        <div>
          <label htmlFor="brand-colour-picker">Brand colour</label>
          <div className="settings-colour-inputs">
            <input
              id="brand-colour-picker"
              type="color"
              aria-label="Choose brand colour"
              value={previewColour.toLowerCase()}
              onChange={(event) => {
                setColour(event.target.value);
                setPreviewColour(event.target.value);
              }}
            />
            <input
              aria-label="Brand colour hex"
              name="brandColour"
              value={colour}
              onChange={(event) => {
                const value = event.target.value;
                setColour(value);
                if (/^#[0-9a-fA-F]{6}$/.test(value)) setPreviewColour(value);
              }}
              required
              pattern="#[0-9a-fA-F]{6}"
              maxLength={7}
              spellCheck={false}
            />
          </div>
        </div>
      </div>
      <p className="field-hint">
        Choose a colour with the swatch, or paste a six-digit hex value. Your
        colour is kept exactly on solid actions in both themes. Link text and
        focus colours adapt separately for readability.
      </p>
      <AppearancePreview
        appearance={settings}
        colour={previewColour}
        name={settings.brandName}
        welcome={settings.welcomeText}
        label="Brand colour preview"
      />
      <div className="form-grid">
        <label>
          Public contact email
          <input
            name="contactEmail"
            type="email"
            defaultValue={settings.contactEmail}
            maxLength={254}
          />
        </label>
        <label>
          Public phone
          <input
            name="contactPhone"
            type="tel"
            defaultValue={settings.contactPhone}
            maxLength={50}
          />
        </label>
      </div>
      <label>
        Business address
        <textarea
          name="businessAddress"
          defaultValue={settings.businessAddress}
          rows={2}
          maxLength={500}
        />
      </label>
      <label>
        Website
        <input
          name="website"
          type="url"
          defaultValue={settings.website}
          placeholder="https://example.com"
          maxLength={250}
        />
      </label>
      <p className="field-hint">
        These details are public and appear in your portal footer and future
        issued invoices. If contact email is blank, future invoices use your
        account email.
      </p>
    </SettingsForm>
  );
}

export function AppearanceSettings({
  settings,
}: {
  settings: Branding;
}): ReactElement {
  const [draft, setDraft] = useState<Appearance>(() =>
    appearanceSchema.parse(settings),
  );
  const [preview, setPreview] = useState<Appearance>(() =>
    appearanceSchema.parse(settings),
  );
  function change(key: keyof Appearance, value: string): void {
    const next = { ...draft, [key]: value };
    const parsed = appearanceSchema.safeParse(next);
    setDraft(next);
    if (parsed.success) setPreview(parsed.data);
  }
  function preset(mode: "light" | "dark", name: string): void {
    const parsed = z
      .enum(["warm", "cool", "chalk", "slate", "midnight", "charcoal"])
      .safeParse(name);
    if (!parsed.success) return;
    const colours = palettes[parsed.data];
    const next = {
      ...draft,
      [`${mode}Palette`]: name,
      [`${mode}Background`]: colours.canvas,
      [`${mode}Surface`]: colours.surface,
    };
    setDraft(next);
    const valid = appearanceSchema.safeParse(next);
    if (valid.success) setPreview(valid.data);
  }
  return (
    <SettingsForm
      title="Installation appearance"
      values={() => ({
        section: "appearance",
        ...draft,
      })}
    >
      <div className="form-grid">
        <label>
          Typography
          <select
            name="typography"
            value={draft.typography}
            onChange={(event) => change("typography", event.target.value)}
          >
            <option value="editorial">
              Editorial · Source Serif 4 + Inter
            </option>
            <option value="modern">Modern · Inter</option>
            <option value="humanist">Humanist · Source Sans 3</option>
          </select>
        </label>
        <label>
          Density
          <select
            name="density"
            value={draft.density}
            onChange={(event) => change("density", event.target.value)}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label>
          Corners
          <select
            name="corners"
            value={draft.corners}
            onChange={(event) => change("corners", event.target.value)}
          >
            <option value="soft">Soft</option>
            <option value="square">Square</option>
          </select>
        </label>
        <label>
          Surface finish
          <select
            name="finish"
            value={draft.finish}
            onChange={(event) => change("finish", event.target.value)}
          >
            <option value="clean">Clean</option>
            <option value="layered">Layered · subtle depth</option>
          </select>
        </label>
        <label>
          Light preset
          <select
            name="lightPalette"
            value={draft.lightPalette}
            onChange={(event) => preset("light", event.target.value)}
          >
            <option value="warm">Warm paper</option>
            <option value="cool">Cool white</option>
            <option value="chalk">Chalk · neutral</option>
          </select>
        </label>
        <label>
          Dark preset
          <select
            name="darkPalette"
            value={draft.darkPalette}
            onChange={(event) => preset("dark", event.target.value)}
          >
            <option value="slate">Slate</option>
            <option value="midnight">Midnight</option>
            <option value="charcoal">Charcoal · neutral</option>
          </select>
        </label>
      </div>
      <div className="form-grid">
        {(
          [
            "lightBackground",
            "lightSurface",
            "darkBackground",
            "darkSurface",
          ] as const
        ).map((key) => (
          <ColourField
            key={key}
            name={key}
            label={
              {
                lightBackground: "Light background",
                lightSurface: "Light surface",
                darkBackground: "Dark background",
                darkSurface: "Dark surface",
              }[key]
            }
            value={draft[key]}
            preview={preview[key]}
            onChange={(value) => change(key, value)}
          />
        ))}
      </div>
      <p className="field-hint">
        Pick page and card colours for each theme. Presets restore a starting
        pair. Text, actions, borders and status colours are derived for
        readability. Every six-digit hex colour can be saved. Strongly mixed
        palettes may still have low-contrast details; guidance never blocks
        saving. Incomplete hex input stays in the field until corrected.
      </p>
      <p className="field-hint" aria-live="polite">
        {JSON.stringify(draft) ===
        JSON.stringify(appearanceSchema.parse(settings))
          ? "Preview matches saved appearance."
          : "Draft preview · save to apply across your portal."}
      </p>
      {appearanceGuidance(preview).map((message) => (
        <p className="appearance-advisory" key={message}>
          {message}
        </p>
      ))}
      <AppearancePreview
        appearance={preview}
        colour={settings.brandColour}
        name={settings.brandName}
        welcome={settings.welcomeText}
        label="Appearance preview"
      />
      <p className="field-hint">
        Applies across public, operator and client screens, and future
        invoice/email styling. Use Appearance in the header for your personal
        light, dark or system preference.
      </p>
    </SettingsForm>
  );
}

function AppearancePreview({
  appearance,
  colour,
  name,
  welcome,
  label,
}: {
  appearance: Appearance;
  colour: string;
  name: string;
  welcome: string;
  label: string;
}): ReactElement {
  return (
    <div className="settings-preview-pair" aria-label={label}>
      {(["light", "dark"] as const).map((mode) => (
        <div
          key={mode}
          data-preview-theme={mode}
          className="appearance-surface settings-preview"
          style={appearanceStyle(appearance, colour)}
        >
          <p className="eyebrow">
            {mode === "light" ? "Light" : "Dark"} · live sample
          </p>
          <div className="card settings-preview-work">
            <span className="status-badge">In progress</span>
            <h2>{name}</h2>
            <p>{welcome}</p>
            <label>
              Project name
              <input
                value="Brand refresh"
                readOnly
                aria-label={`${mode} sample project name`}
              />
            </label>
            <div className="settings-preview-actions">
              <a
                className="button"
                href="/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Your portal ↗
              </a>
              <a
                href="/operator-guide"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the guide
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ColourField({
  name,
  label,
  value,
  preview,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  preview: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <div>
      <label htmlFor={`colour-${name}`}>{label}</label>
      <div className="settings-colour-inputs">
        <input
          id={`colour-${name}`}
          type="color"
          aria-label={`Choose ${label.toLowerCase()} colour`}
          value={preview.toLowerCase()}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          aria-label={`${label} hex`}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          pattern="#[0-9a-fA-F]{6}"
          maxLength={7}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export function LogoSettings({
  logoId,
}: {
  logoId: string | null;
}): ReactElement {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    requestId.current ??= crypto.randomUUID();
    data.set("requestId", requestId.current);
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/logo", {
        method: "POST",
        body: data,
      });
      const result = z
        .object({ error: z.object({ message: z.string() }).nullable() })
        .parse(await response.json());
      if (!response.ok) {
        setError(
          result.error?.message ?? "Logo could not be saved. Please retry.",
        );
        return;
      }
      form.reset();
      requestId.current = null;
      setMessage(
        "Logo saved. Public branding and future invoices use this image.",
      );
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Upload failed. Your selection is kept for retry.",
      );
    } finally {
      setPending(false);
    }
  }
  async function remove(): Promise<void> {
    if (
      !window.confirm(
        "Remove the current logo? Issued invoices keep their original image.",
      )
    )
      return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await clientRequest("/api/settings/logo", "DELETE", {}, z.unknown());
      setMessage("Current logo removed. Historical images are retained.");
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to remove logo. Please retry.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="settings-logo">
      <div className="logo-thumbnail">
        {logoId ? (
          <Image
            unoptimized
            src={`/api/branding/logo/${logoId}`}
            alt="Current public logo"
            width={96}
            height={96}
          />
        ) : (
          <span>No logo</span>
        )}
      </div>
      <div>
        <form onSubmit={(event) => void upload(event)} aria-label="Logo">
          <fieldset disabled={pending}>
            <label>
              Public logo
              <input
                type="file"
                name="file"
                accept="image/png,image/jpeg,image/webp"
                required
                onChange={() => {
                  requestId.current = null;
                  setMessage("");
                  setError("");
                }}
              />
            </label>
            <p className="field-hint">
              PNG, JPEG or WebP, up to 2 MB (or your lower upload limit). Choose
              a public image; uploaded logos remain available to historical
              invoices and emails.
            </p>
            <button type="submit">
              {pending
                ? "Saving…"
                : error
                  ? "Retry logo upload"
                  : "Upload logo"}
            </button>
            {logoId && (
              <button
                type="button"
                className="secondary"
                onClick={() => void remove()}
              >
                Remove logo
              </button>
            )}
          </fieldset>
        </form>
        <p role="alert">{error}</p>
        <p role="status">{message}</p>
      </div>
    </div>
  );
}
