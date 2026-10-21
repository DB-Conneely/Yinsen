import { z } from "zod";
import type { CSSProperties } from "react";

export const hexColour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit hex colour.");
export const appearanceSchema = z
  .object({
    typography: z.enum(["editorial", "modern"]),
    density: z.enum(["comfortable", "compact"]),
    corners: z.enum(["soft", "square"]),
    lightPalette: z.enum(["warm", "cool"]),
    darkPalette: z.enum(["slate", "midnight"]),
    lightBackground: hexColour,
    lightSurface: hexColour,
    darkBackground: hexColour,
    darkSurface: hexColour,
  })
  .superRefine((value, context) => {
    for (const mode of ["light", "dark"] as const) {
      if (
        !readableForeground(value[`${mode}Background`], value[`${mode}Surface`])
      )
        context.addIssue({
          code: "custom",
          path: [`${mode}Surface`],
          message:
            "This shared palette cannot keep all text and controls readable with that background/surface pair. Try colours with more similar brightness, or start from a preset.",
        });
    }
  });
export type Appearance = z.infer<typeof appearanceSchema>;
export const defaultAppearance: Appearance = {
  typography: "editorial",
  density: "comfortable",
  corners: "soft",
  lightPalette: "warm",
  darkPalette: "slate",
  lightBackground: "#f4f4f0",
  lightSurface: "#fffefa",
  darkBackground: "#151a20",
  darkSurface: "#1d242c",
};
export const palettes = {
  warm: {
    canvas: "#f4f4f0",
    surface: "#fffefa",
    surfaceMuted: "#eeefe9",
    text: "#242c30",
    muted: "#636e73",
    border: "#dcdfd8",
  },
  cool: {
    canvas: "#f0f4f8",
    surface: "#ffffff",
    surfaceMuted: "#e7edf4",
    text: "#1f2b3b",
    muted: "#53657b",
    border: "#d2dce8",
  },
  slate: {
    canvas: "#151a20",
    surface: "#1d242c",
    surfaceMuted: "#27313a",
    text: "#eff3f6",
    muted: "#aebbc5",
    border: "#36434e",
  },
  midnight: {
    canvas: "#121827",
    surface: "#1a2336",
    surfaceMuted: "#26324a",
    text: "#f1f4fd",
    muted: "#b1bfd9",
    border: "#3c4963",
  },
};

function channels(hex: string): number[] {
  return [1, 3, 5].map((position) =>
    parseInt(hex.slice(position, position + 2), 16),
  );
}
function mix(left: string, right: string, fraction: number): string {
  const a = channels(left),
    b = channels(right);
  return `#${a
    .map((channel, index) =>
      Math.round(channel * (1 - fraction) + (b[index] ?? 0) * fraction)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
function luminance(hex: string): number {
  return channels(hex).reduce((sum, channel, index) => {
    const value = channel / 255;
    return (
      sum +
      (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
        ([0.2126, 0.7152, 0.0722][index] ?? 0)
    );
  }, 0);
}
export function contrastRatio(left: string, right: string): number {
  const a = luminance(left),
    b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function backgrounds(canvas: string, surface: string, ink: string): string[] {
  return [
    canvas,
    surface,
    mix(surface, ink, 0.04),
    ...[0.35, 0.45, 0.55, 0.6].map((fraction) =>
      mix(surface, canvas, fraction),
    ),
  ];
}
function readableForeground(
  canvas: string,
  surface: string,
): string | undefined {
  return ["#000000", "#ffffff"].find((ink) =>
    backgrounds(canvas, surface, ink).every(
      (background) => contrastRatio(ink, background) >= 4.5,
    ),
  );
}
function tone(
  base: string,
  ink: string,
  surfaces: string[],
  minimum = 4.5,
): string {
  for (let step = 0; step <= 20; step++) {
    const colour = mix(base, ink, step / 20);
    if (surfaces.every((surface) => contrastRatio(colour, surface) >= minimum))
      return colour;
  }
  return ink;
}

export function themePalette(
  value: Appearance,
  mode: "light" | "dark",
  brandColour = "#2457a7",
): typeof palettes.warm & {
  accentInk: string;
  accentSoft: string;
  actionInk: string;
  danger: string;
  dangerSurface: string;
  positive: string;
  positiveSurface: string;
  colorScheme: "light" | "dark";
} {
  const preset =
    palettes[mode === "light" ? value.lightPalette : value.darkPalette];
  // Old issued snapshots predate custom surfaces and retain their saved preset.
  const canvas = value[`${mode}Background`] ?? preset.canvas,
    surface = value[`${mode}Surface`] ?? preset.surface;
  const ink = readableForeground(canvas, surface) ?? "#000000",
    surfaces = backgrounds(canvas, surface, ink);
  const surfaceMuted = surfaces[2] ?? surface;
  const accentInk = tone(brandColour, ink, surfaces, 5.2);
  return {
    canvas,
    surface,
    surfaceMuted,
    text: tone(preset.text, ink, surfaces),
    muted: tone(preset.muted, ink, surfaces),
    border: tone(preset.border, ink, surfaces, 3),
    accentInk,
    accentSoft: surfaceMuted,
    actionInk:
      contrastRatio(accentInk, "#000000") > contrastRatio(accentInk, "#ffffff")
        ? "#000000"
        : "#ffffff",
    danger: tone(mode === "light" ? "#a62c3b" : "#ff9ba7", ink, surfaces),
    dangerSurface: surfaceMuted,
    positive: tone(mode === "light" ? "#236349" : "#9bd4b6", ink, surfaces),
    positiveSurface: surfaceMuted,
    colorScheme: ink === "#ffffff" ? "dark" : "light",
  };
}

export function appearanceStyle(
  value: Appearance,
  brandColour = "#2457a7",
): CSSProperties {
  const light = themePalette(value, "light", brandColour),
    dark = themePalette(value, "dark", brandColour);
  const variables: Record<string, string> = {};
  variables["--font-display"] =
    '"Iowan Old Style", Baskerville, "Palatino Linotype", Georgia, "Liberation Serif", serif';
  variables["--radius"] = "0.875rem";
  variables["--radius-small"] = "0.5rem";
  variables["--space-3"] = "1.25rem";
  variables["--space-4"] = "2rem";
  variables["--space-5"] = "2.75rem";
  variables["--control-height"] = "2.625rem";
  for (const [name, palette] of [
    ["light", light],
    ["dark", dark],
  ] as const)
    for (const [key, colour] of Object.entries(palette))
      variables[
        `--${name}-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
      ] = colour;
  if (value.typography === "modern")
    variables["--font-display"] = "ui-sans-serif, system-ui, sans-serif";
  if (value.corners === "square") {
    variables["--radius"] = "0.25rem";
    variables["--radius-small"] = "0.2rem";
  }
  if (value.density === "compact") {
    variables["--space-3"] = "1rem";
    variables["--space-4"] = "1.5rem";
    variables["--space-5"] = "2rem";
    variables["--control-height"] = "2.5rem";
  }
  return variables;
}
