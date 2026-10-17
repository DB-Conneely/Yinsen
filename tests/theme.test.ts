import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { themeBootstrap } from "../src/lib/theme";
import { ThemeToggle } from "../src/components/theme-toggle";

describe("the actual prepaint theme bootstrap", () => {
  it.each([
    [null, true, "dark"],
    [null, false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["invalid", true, "dark"],
  ])("resolves stored %s and system %s to %s", (stored, dark, expected) => {
    const dataset: Record<string, string> = {};
    runInNewContext(themeBootstrap, {
      document: { documentElement: { dataset } },
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: dark }),
    });
    expect(dataset.theme).toBe(expected);
  });
  it("still applies the system theme when storage is denied", () => {
    const dataset: Record<string, string> = {};
    runInNewContext(themeBootstrap, {
      document: { documentElement: { dataset } },
      localStorage: {
        getItem: () => {
          throw new DOMException("Blocked", "SecurityError");
        },
      },
      matchMedia: () => ({ matches: true }),
    });
    expect(dataset.theme).toBe("dark");
  });
  it("renders an accessible system-default control that waits for hydration", () => {
    const html = renderToStaticMarkup(createElement(ThemeToggle));
    expect(html).toContain('aria-label="Appearance"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('value="system" selected=""');
    expect(html).toContain('value="dark"');
    expect(html).toContain('value="light"');
  });
});
