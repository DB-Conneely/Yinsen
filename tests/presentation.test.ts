import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardNavigation } from "../src/components/dashboard-nav";
import { MilestoneFiles } from "../src/components/milestone-files";

const route = vi.hoisted(() => ({ pathname: "/dashboard/clients" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("the installed shared workspace navigation", () => {
  it("keeps client management in the operator workspace and marks its actual route", () => {
    route.pathname = "/dashboard/clients/record";
    const html = renderToStaticMarkup(createElement(DashboardNavigation));
    expect(html).toMatch(
      /<a\b(?=[^>]*href="\/dashboard\/clients")(?=[^>]*aria-current="page")[^>]*>/,
    );
    expect(html).toContain('href="/dashboard/projects"');
    expect(html).not.toContain('href="/portal/messages"');
  });

  it("gives the client its real account, projects and active conversation without operator links", () => {
    route.pathname = "/portal/messages";
    const html = renderToStaticMarkup(
      createElement(DashboardNavigation, { role: "client" }),
    );
    expect(html).toContain('href="/portal"');
    expect(html).toContain('href="/portal/projects"');
    expect(html).toMatch(
      /<a\b(?=[^>]*href="\/portal\/messages")(?=[^>]*aria-current="page")[^>]*>/,
    );
    expect(html).not.toContain('href="/dashboard');
  });

  it("shows actual per-version status/history without offering locked client bytes", () => {
    const root = {
      id: "root",
      milestoneId: "milestone",
      parentDeliverableId: null,
      version: 1,
      filename: "Brand guide.txt",
      size: 45,
      released: true,
      uploadedAt: "2026-10-17T12:00:00Z",
    };
    const files = [
      root,
      {
        ...root,
        id: "next",
        parentDeliverableId: "root",
        version: 2,
        released: false,
      },
    ];
    const html = renderToStaticMarkup(
      createElement(MilestoneFiles, {
        milestoneId: "milestone",
        milestoneName: "Design",
        files,
        operator: false,
        maxBytes: 1048576,
      }),
    );
    expect(html).toContain("Version 2");
    expect(html).toContain("Previous versions (1)");
    expect(html).toContain('href="/api/deliverables/root/download"');
    expect(html).not.toContain('href="/api/deliverables/next/download"');
    expect(html).not.toContain("Upload file");
    const operator = renderToStaticMarkup(
      createElement(MilestoneFiles, {
        milestoneId: "milestone",
        milestoneName: "Design",
        files,
        operator: true,
        maxBytes: 1048576,
      }),
    );
    expect(operator).toContain("Upload file");
    expect(operator).toContain("Relock");
    expect(operator).toContain("Release");
    expect(operator).toContain('href="/api/deliverables/next/download"');
  });
});
