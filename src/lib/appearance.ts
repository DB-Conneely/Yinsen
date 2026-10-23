import { z } from "zod";
import type { CSSProperties } from "react";

export const hexColour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit hex colour.");
export const appearanceSchema = z.object({
  typography: z.enum(["editorial", "modern", "humanist"]),
  density: z.enum(["comfortable", "compact"]),
  corners: z.enum(["soft", "square"]),
  finish: z.enum(["clean", "layered"]),
  lightPalette: z.enum(["warm", "cool", "chalk"]),
  darkPalette: z.enum(["slate", "midnight", "charcoal"]),
  lightBackground: hexColour,
  lightSurface: hexColour,
  darkBackground: hexColour,
  darkSurface: hexColour,
});
export type Appearance = z.infer<typeof appearanceSchema>;
// Issued snapshots may predate custom surfaces and finish. Never rewrite their stored facts.
export type AppearanceSnapshot = Omit<
  Appearance,
  | "finish"
  | "lightBackground"
  | "lightSurface"
  | "darkBackground"
  | "darkSurface"
> &
  Partial<
    Pick<
      Appearance,
      | "finish"
      | "lightBackground"
      | "lightSurface"
      | "darkBackground"
      | "darkSurface"
    >
  >;
export const defaultAppearance: Appearance = {
  typography: "editorial",
  density: "comfortable",
  corners: "soft",
  finish: "layered",
  lightPalette: "warm",
  darkPalette: "slate",
  lightBackground: "#f4f4f0",
  lightSurface: "#fffefa",
  darkBackground: "#151a20",
  darkSurface: "#1d242c",
};
export const legacyAppearance: Appearance = {
  ...defaultAppearance,
  finish: "clean",
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
  chalk: {
    canvas: "#f3f3f3",
    surface: "#ffffff",
    surfaceMuted: "#eaeaea",
    text: "#262626",
    muted: "#626262",
    border: "#d5d5d5",
  },
  charcoal: {
    canvas: "#181818",
    surface: "#242424",
    surfaceMuted: "#303030",
    text: "#f2f2f2",
    muted: "#b6b6b6",
    border: "#484848",
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
function onColour(colour: string): string {
  return contrastRatio(colour, "#000000") > contrastRatio(colour, "#ffffff")
    ? "#000000"
    : "#ffffff";
}

export function appearanceGuidance(value: Appearance): string[] {
  return (["light", "dark"] as const).flatMap((mode) =>
    readableForeground(value[`${mode}Background`], value[`${mode}Surface`])
      ? []
      : [
          `${mode === "light" ? "Light" : "Dark"} background and ${mode} surface differ strongly in brightness. Text adapts to each base, but mixed panels or borders may have low contrast. You can save these colours, or start from a preset.`,
        ],
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

type ThemePalette = typeof palettes.warm & {
  accentInk: string;
  brandFill: string;
  focus: string;
  surfaceText: string;
  surfaceMutedText: string;
  surfaceAccentInk: string;
  surfaceBorder: string;
  surfaceFocus: string;
  accentSoft: string;
  actionInk: string;
  danger: string;
  dangerSurface: string;
  positive: string;
  positiveSurface: string;
  colorScheme: "light" | "dark";
};
type SurfaceRoles = Omit<
  ThemePalette,
  | "canvas"
  | "surface"
  | "text"
  | "muted"
  | "border"
  | "accentInk"
  | "brandFill"
  | "focus"
  | "actionInk"
  | "colorScheme"
>;

function surfaceRoles(
  preset: typeof palettes.warm,
  surface: string,
  ink: string,
  brand: string,
  sharedSurfaces?: string[],
): SurfaceRoles {
  const surfaceMuted = mix(surface, ink, 0.04);
  const targets = sharedSurfaces ?? [surface, surfaceMuted];
  return {
    surfaceMuted,
    surfaceText: tone(preset.text, ink, targets),
    surfaceMutedText: tone(preset.muted, ink, targets),
    surfaceAccentInk: tone(brand, ink, targets, 5.2),
    surfaceBorder: tone(preset.border, ink, targets, 3),
    surfaceFocus: tone(brand, ink, targets, 3),
    accentSoft: surfaceMuted,
    danger: tone("#a62c3b", ink, targets),
    dangerSurface: surfaceMuted,
    positive: tone("#236349", ink, targets),
    positiveSurface: surfaceMuted,
  };
}

export function themePalette(
  value: AppearanceSnapshot,
  mode: "light" | "dark",
  brandColour = "#2457a7",
): ThemePalette {
  const preset =
    palettes[mode === "light" ? value.lightPalette : value.darkPalette];
  // Old issued snapshots predate custom surfaces and retain their saved preset.
  const canvas = value[`${mode}Background`] ?? preset.canvas,
    surface = value[`${mode}Surface`] ?? preset.surface;
  const shared = readableForeground(canvas, surface);
  const ink = shared ?? onColour(canvas),
    surfaces = shared ? backgrounds(canvas, surface, ink) : [canvas];
  const surfaceInk = shared ?? onColour(surface);
  const accentInk = tone(brandColour, ink, surfaces, 5.2);
  return {
    canvas,
    surface,
    text: tone(preset.text, ink, surfaces),
    muted: tone(preset.muted, ink, surfaces),
    border: tone(preset.border, ink, surfaces, 3),
    accentInk,
    brandFill: brandColour,
    focus: tone(brandColour, ink, surfaces, 3),
    actionInk: onColour(brandColour),
    ...surfaceRoles(
      preset,
      surface,
      surfaceInk,
      brandColour,
      shared ? surfaces : undefined,
    ),
    colorScheme: ink === "#ffffff" ? "dark" : "light",
  };
}

export function appearanceStyle(
  value: AppearanceSnapshot,
  brandColour = "#2457a7",
): CSSProperties & Record<`--${string}`, string> {
  const light = themePalette(value, "light", brandColour),
    dark = themePalette(value, "dark", brandColour);
  const variables: Record<string, string> = {};
  variables["--font-body"] =
    value.typography === "humanist"
      ? 'var(--font-source-sans, "Source Sans 3"), sans-serif'
      : 'var(--font-inter, "Inter"), sans-serif';
  variables["--font-display"] =
    value.typography === "editorial"
      ? 'var(--font-source-serif, "Source Serif 4"), Georgia, serif'
      : variables["--font-body"];
  variables["--shadow"] =
    value.finish === "layered"
      ? "0 1px 2px #00000014, 0 8px 22px #00000012, 0 24px 48px #00000008"
      : "none";
  variables["--surface-inset"] =
    value.finish === "layered"
      ? "inset 0 1px 0 #ffffff66, inset 0 -1px 0 #0000000a"
      : "inset 0 1px 0 #ffffff18";
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
