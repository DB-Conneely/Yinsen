import type { Invoice } from "../invoices/queries";
import { legacyAppearance, themePalette } from "../appearance";
import { readConfiguration } from "../config";

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}

export function brandedEmail(
  name: string,
  content: string,
  details: Invoice["issuerDetails"],
  contactEmail = "",
): string {
  const appearance = details ?? legacyAppearance;
  const light = themePalette(appearance, "light"),
    dark = themePalette(appearance, "dark");
  // Email clients can replace fonts/colours; no remote font fetch is required.
  const bodyFont =
    appearance.typography === "humanist"
      ? "'Source Sans 3','Segoe UI',Arial,sans-serif"
      : "Inter,Arial,sans-serif";
  const font =
    appearance.typography === "editorial"
      ? "'Source Serif 4',Georgia,serif"
      : bodyFont;
  const shadow =
    appearance.finish === "layered" ? "0 2px 12px #00000012" : "none";
  const spacing = appearance.density === "compact" ? 20 : 32;
  const radius = appearance.corners === "soft" ? 14 : 4;
  const logo = details?.logoId
    ? `<img src="${escapeHtml(readConfiguration().origin)}/api/branding/logo/${details.logoId}" width="64" height="64" alt="${escapeHtml(name)} logo" style="object-fit:contain">`
    : "";
  const contact = [
    contactEmail,
    details?.contactPhone,
    details?.businessAddress,
    details?.website,
  ]
    .filter(Boolean)
    .map((line) => escapeHtml(line ?? ""))
    .join("<br>");
  return `<html><head><meta name="color-scheme" content="light dark"><style>@media(prefers-color-scheme:dark){.email-body{background:${dark.canvas}!important;color:${dark.text}!important}.email-card{background:${dark.surface}!important;color:${dark.surfaceText}!important}}</style></head><body class="email-body" style="background:${light.canvas};color:${light.text};font-family:${bodyFont};padding:16px"><div class="email-card" style="max-width:600px;margin:auto;padding:${spacing}px;background:${light.surface};color:${light.surfaceText};border-radius:${radius}px;box-shadow:${shadow}">${logo}<h1 style="font-family:${font}">${escapeHtml(name)}</h1>${content}<p style="white-space:pre-line">${contact}</p></div></body></html>`;
}
