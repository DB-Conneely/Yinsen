import { createElement, Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BrandingSettings,
  AppearanceSettings,
  LogoSettings,
} from "../src/components/settings-branding";
import {
  AccountSettings,
  PasswordSettings,
  OperatorSessionSettings,
  ClientSessionSettings,
} from "../src/components/settings-account";
import {
  PortalSettings,
  UpdateSettings,
} from "../src/components/settings-general";
import { SettingsForm } from "../src/components/settings-form";
import SettingsLoading from "../src/app/dashboard/settings/loading";
import SettingsError from "../src/app/dashboard/settings/error";
import { defaultAppearance } from "../src/lib/appearance";
import type { Branding } from "../src/lib/settings";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
const branding: Branding = {
  ...defaultAppearance,
  brandName: "Fieldwork",
  brandColour: "#315e9e",
  defaultCurrency: "EUR",
  welcomeText: "A private space.",
  contactEmail: "hello@example.test",
  contactPhone: "123",
  businessAddress: "Studio 4",
  website: "https://example.test",
  logoId: "00000000-0000-4000-8000-000000000001",
};
describe("installed independent settings sections", () => {
  it("renders saved brand/contact/logo and bounded appearance preview with accessible labels", () => {
    const brand = renderToStaticMarkup(
      createElement(BrandingSettings, { settings: branding }),
    );
    for (const field of [
      "Brand name",
      "Brand colour",
      "Public contact email",
      "Public phone",
      "Business address",
      "Website",
    ])
      expect(brand).toContain(field);
    expect(brand).toContain("hello@example.test");
    expect(brand).toContain('type="color"');
    expect(brand).toContain('aria-label="Choose brand colour"');
    expect(brand).toContain('aria-label="Brand colour hex"');
    expect(brand).toContain("Brand colour preview");
    const appearance = renderToStaticMarkup(
      createElement(AppearanceSettings, { settings: branding }),
    );
    expect(appearance).toContain("Appearance preview");
    expect(appearance).toContain("Dark preset");
    for (const name of [
      "Light background",
      "Light surface",
      "Dark background",
      "Dark surface",
    ])
      expect(appearance).toContain(`${name} hex`);
    expect(appearance).toContain("Editorial");
    const logo = renderToStaticMarkup(
      createElement(LogoSettings, { logoId: branding.logoId }),
    );
    expect(logo).toContain("/api/branding/logo/");
    expect(logo).toContain("image/png,image/jpeg,image/webp");
    expect(
      renderToStaticMarkup(createElement(LogoSettings, { logoId: null })),
    ).toContain("No logo");
  });
  it("separates future defaults and permission-only saved state from personal theme and infrastructure", () => {
    const portal = renderToStaticMarkup(
      createElement(PortalSettings, { settings: branding }),
    );
    expect(portal).toContain('<option selected="">EUR</option>');
    expect(portal).toContain("never converted");
    for (const enabled of [false, true]) {
      const html = renderToStaticMarkup(
        createElement(UpdateSettings, { enabled }),
      );
      expect(html).toContain("Allow automatic updates");
      expect(html).toContain("Saving starts no update");
      expect(html.includes('checked=""')).toBe(enabled);
      expect(html).toContain(`saved choice is ${enabled ? "on" : "off"}`);
      expect(html).not.toContain("up to date");
      expect(html).not.toContain("SSH");
    }
    const form = renderToStaticMarkup(
      createElement(
        SettingsForm,
        {
          title: "Section",
          values: () => ({}),
        },
        "Fields",
      ),
    );
    expect(form).toContain('aria-label="Section"');
    expect(form).toContain("Save section");
  });
  it("renders complete security controls without tokens and uses deterministic UTC session dates", () => {
    const identity = {
      id: "00000000-0000-4000-8000-000000000002",
      role: "operator" as const,
      name: "Alex",
      email: "alex@example.test",
    };
    expect(
      renderToStaticMarkup(createElement(AccountSettings, { identity })),
    ).toContain("Current password");
    expect(renderToStaticMarkup(createElement(PasswordSettings))).toContain(
      "Confirm new password",
    );
    const sessions = renderToStaticMarkup(
      createElement(OperatorSessionSettings, {
        sessions: [
          {
            id: identity.id,
            createdAt: "2026-10-21T19:30:00Z",
            expiresAt: "2027-01-19T19:30:00Z",
            current: true,
          },
        ],
      }),
    );
    expect(sessions).toContain("2026-10-21 19:30");
    expect(sessions).toContain("UTC");
    expect(sessions).toContain("This browser");
    expect(sessions).not.toContain("token");
    expect(
      renderToStaticMarkup(
        createElement(ClientSessionSettings, { clients: [{ ...identity }] }),
      ),
    ).toContain("Alex · alex@example.test");
    expect(
      renderToStaticMarkup(
        createElement(ClientSessionSettings, { clients: [] }),
      ),
    ).toContain("No active clients");
  });
  it("renders real loading and framework retry without inventing saved settings", () => {
    expect(renderToStaticMarkup(createElement(SettingsLoading))).toContain(
      'aria-busy="true"',
    );
    const retry = vi.fn(),
      tree = SettingsError({ retry });
    if (!isValidElement<{ children: ReactNode }>(tree))
      throw new TypeError("Missing error view");
    for (const child of Children.toArray(tree.props.children))
      if (
        isValidElement<{ onClick?: () => void }>(child) &&
        child.type === "button"
      )
        child.props.onClick?.();
    expect(retry).toHaveBeenCalledOnce();
  });
});
