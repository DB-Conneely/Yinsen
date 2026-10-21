import type { Invoice } from "../invoices/queries";
import { defaultAppearance, themePalette } from "../appearance";
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
  const appearance = details ?? defaultAppearance;
  const light = themePalette(appearance, "light"),
    dark = themePalette(appearance, "dark");
  const font =
    appearance.typography === "modern"
      ? "system-ui,sans-serif"
      : "Georgia,serif";
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
  return `<html><head><meta name="color-scheme" content="light dark"><style>@media(prefers-color-scheme:dark){.email-body{background:${dark.canvas}!important;color:${dark.text}!important}.email-card{background:${dark.surface}!important}}</style></head><body class="email-body" style="background:${light.canvas};color:${light.text};font-family:system-ui,sans-serif;padding:16px"><div class="email-card" style="max-width:600px;margin:auto;padding:${spacing}px;background:${light.surface};border-radius:${radius}px">${logo}<h1 style="font-family:${font}">${escapeHtml(name)}</h1>${content}<p style="white-space:pre-line">${contact}</p></div></body></html>`;
}
