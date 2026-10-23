import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardNavigation } from "../src/components/dashboard-nav";
import { ProjectLive } from "../src/components/project-live";
import { SettingsForm } from "../src/components/settings-form";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/invoices/new",
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("workspace composition", () => {
  it("labels the compact disclosure with the current destination and retains every destination", () => {
    const html = renderToStaticMarkup(createElement(DashboardNavigation));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="workspace-navigation"');
    expect(html).toContain("<span>Invoices</span>");
    for (const destination of [
      "Overview",
      "Clients",
      "Projects",
      "Invoices",
      "Analytics",
      "Settings",
      "Public portal",
      "Notifications",
    ])
      expect(html).toContain(destination);
    const invoices = html.match(/<a[^>]*>Invoices<\/a>/)?.[0];
    expect(invoices).toContain('href="/dashboard/invoices"');
    expect(invoices).toContain('aria-current="page"');
  });

  it("renders the workspace without an ordinary connection announcement", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectLive, null, "Project work"),
    );
    expect(html).toBe("Project work");
  });

  it("keeps reverted appearance feedback consistent with its saved preview", () => {
    const html = renderToStaticMarkup(
      createElement(SettingsForm, {
        title: "Appearance",
        dirty: false,
        values: () => ({}),
      }),
    );
    expect(html).toContain("Matches saved settings.");
    expect(html).not.toContain("Unsaved changes.");
  });
});
