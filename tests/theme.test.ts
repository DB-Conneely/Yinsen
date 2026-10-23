import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { themeBootstrap } from "../src/lib/theme";
import { ThemeToggle } from "../src/components/theme-toggle";
import { readFile } from "node:fs/promises";
import {
  appearanceStyle,
  defaultAppearance,
  legacyAppearance,
  themePalette,
} from "../src/lib/appearance";

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

describe("self-hosted appearance and snapshot compatibility", () => {
  it("preserves old preset snapshots with clean finish and all existing options", () => {
    const old = {
      typography: "modern" as const,
      density: "compact" as const,
      corners: "square" as const,
      lightPalette: "cool" as const,
      darkPalette: "midnight" as const,
    };
    const css = appearanceStyle(old, "#7400b3");
    expect(css).toMatchObject({
      "--shadow": "none",
      "--radius": "0.25rem",
      "--control-height": "2.5rem",
      "--light-brand-fill": "#7400b3",
      "--dark-brand-fill": "#7400b3",
    });
    expect(themePalette(old, "light").surface).toBe("#ffffff");
    expect(themePalette(old, "dark").surface).toBe("#1a2336");
    expect(appearanceStyle(legacyAppearance)["--shadow"]).toBe("none");
    expect(appearanceStyle(defaultAppearance)["--shadow"]).not.toBe("none");
  });
  it("offers distinct real font treatments with licensed WOFF2 assets", async () => {
    const editorial = appearanceStyle(defaultAppearance);
    const modern = appearanceStyle({
      ...defaultAppearance,
      typography: "modern",
    });
    const humanist = appearanceStyle({
      ...defaultAppearance,
      typography: "humanist",
    });
    expect(editorial["--font-display"]).toContain("--font-source-serif");
    expect(editorial["--font-body"]).toEqual(modern["--font-body"]);
    expect(modern["--font-display"]).toEqual(modern["--font-body"]);
    expect(humanist["--font-body"]).toContain("--font-source-sans");
    for (const [font, license] of [
      ["InterVariable.woff2", "Inter-LICENSE.txt"],
      ["SourceSerif4Variable-Roman.woff2", "SourceSerif4-LICENSE.txt"],
      ["SourceSans3VF-Upright.woff2", "SourceSans3-LICENSE.txt"],
    ]) {
      const bytes = await readFile(`src/app/fonts/${font}`);
      expect(bytes.subarray(0, 4).toString()).toBe("wOF2");
      expect(await readFile(`src/app/fonts/${license}`, "utf8")).toMatch(
        /SIL OPEN FONT LICENSE/i,
      );
    }
  });
});
