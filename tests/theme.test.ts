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
      "--radius": "0.25rem",
      "--control-height": "2.5rem",
      "--light-brand-fill": "#7400b3",
      "--dark-brand-fill": "#7400b3",
    });
    expect(themePalette(old, "light").surface).toBe("#ffffff");
    expect(themePalette(old, "dark").surface).toBe("#1a2336");
    expect(css["--shadow"]).toEqual(
      appearanceStyle(legacyAppearance)["--shadow"],
    );
    expect(css["--shadow"]).not.toBe("none");
    expect(appearanceStyle(defaultAppearance)["--shadow"]).not.toEqual(
      css["--shadow"],
    );
  });
  it("derives material from each saved surface independently of its theme", () => {
    const css = appearanceStyle({
      ...defaultAppearance,
      lightBackground: "#ffffff",
      lightSurface: "#000000",
      darkBackground: "#000000",
      darkSurface: "#ffffff",
    });
    const neutral = appearanceStyle(defaultAppearance);
    expect(css["--light-material-top"]).toBe(neutral["--dark-material-top"]);
    expect(css["--dark-material-top"]).toBe(neutral["--light-material-top"]);
    expect(css["--light-canvas-material-top"]).toBe(
      neutral["--light-material-top"],
    );
  });
  it("starts fresh portals near black while preserving historical dark bases", () => {
    expect(defaultAppearance.darkPalette).toBe("charcoal");
    expect(themePalette(defaultAppearance, "dark")).toMatchObject({
      canvas: "#0a0a0b",
      surface: "#151516",
    });
    expect(themePalette(legacyAppearance, "dark")).toMatchObject({
      canvas: "#151a20",
      surface: "#1d242c",
    });
    const oldCharcoal = {
      typography: "modern" as const,
      density: "compact" as const,
      corners: "square" as const,
      lightPalette: "warm" as const,
      darkPalette: "charcoal" as const,
    };
    expect(themePalette(oldCharcoal, "dark")).toMatchObject({
      canvas: "#181818",
      surface: "#242424",
    });
    expect(
      themePalette({ ...defaultAppearance, darkBackground: "#0088ff" }, "dark")
        .canvas,
    ).toBe("#0088ff");
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
