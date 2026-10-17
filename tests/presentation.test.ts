import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardNavigation } from "../src/components/dashboard-nav";

const route = vi.hoisted(() => ({ pathname: "/dashboard/clients" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

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
});
