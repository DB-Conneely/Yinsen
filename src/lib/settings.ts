import { z } from "zod";
import { getDb, getSql } from "./db/client";
import { settings } from "./db/schema";
import { operatorOnly, type ProjectActor } from "./projects/access";
import { setupSchema, emailSchema } from "./auth/validation";
import { appearanceSchema } from "./appearance";
import { AppError } from "./errors";

// Public branding is deliberately independent of operational settings and invoice counters.
const publicFields = {
  brandName: settings.brandName,
  brandColour: settings.brandColour,
  defaultCurrency: settings.defaultCurrency,
  welcomeText: settings.welcomeText,
  contactEmail: settings.contactEmail,
  contactPhone: settings.contactPhone,
  businessAddress: settings.businessAddress,
  website: settings.website,
  logoId: settings.logoId,
  typography: settings.typography,
  density: settings.density,
  corners: settings.corners,
  lightPalette: settings.lightPalette,
  darkPalette: settings.darkPalette,
  lightBackground: settings.lightBackground,
  lightSurface: settings.lightSurface,
  darkBackground: settings.darkBackground,
  darkSurface: settings.darkSurface,
};
export type Branding = Pick<
  typeof settings.$inferSelect,
  keyof typeof publicFields
>;
export type OperatorSettings = Branding & {
  invoicePrefix: string;
  invoiceNextNumber: number;
  paymentInstructions: string;
  allowAutomaticUpdates: boolean;
};
export const settingsInput = z.discriminatedUnion("section", [
  z
    .object({
      section: z.literal("branding"),
      brandName: setupSchema.shape.brandName,
      brandColour: setupSchema.shape.brandColour,
      contactEmail: z.union([emailSchema, z.literal("")]),
      contactPhone: z.string().trim().max(50),
      businessAddress: z.string().trim().max(500),
      website: z.union([
        z
          .url()
          .max(250)
          .refine(
            (url) => /^https?:\/\//.test(url),
            "Use an HTTP or HTTPS website.",
          ),
        z.literal(""),
      ]),
    })
    .strict(),
  appearanceSchema.safeExtend({ section: z.literal("appearance") }).strict(),
  z
    .object({
      section: z.literal("portal"),
      welcomeText: setupSchema.shape.welcomeText,
      defaultCurrency: setupSchema.shape.defaultCurrency,
    })
    .strict(),
  z
    .object({
      section: z.literal("updates"),
      allowAutomaticUpdates: z.boolean(),
    })
    .strict(),
]);

export async function getBranding(): Promise<Branding | null> {
  const rows = await getDb().select(publicFields).from(settings);
  return rows[0] ?? null;
}

export async function getOperatorSettings(
  actor: ProjectActor,
): Promise<OperatorSettings> {
  operatorOnly(actor);
  const rows = await getDb()
    .select({
      ...publicFields,
      invoicePrefix: settings.invoicePrefix,
      invoiceNextNumber: settings.invoiceNextNumber,
      paymentInstructions: settings.paymentInstructions,
      allowAutomaticUpdates: settings.allowAutomaticUpdates,
    })
    .from(settings);
  if (!rows[0])
    throw new AppError(
      503,
      "SETUP_REQUIRED",
      "Complete installation setup first.",
    );
  return rows[0];
}

export async function saveSettings(
  input: unknown,
  actor: ProjectActor,
): Promise<{ saved: true }> {
  operatorOnly(actor);
  const { section: _section, ...values } = settingsInput.parse(input);
  await getDb().update(settings).set(values);
  return { saved: true };
}

export async function removeLogo(
  actor: ProjectActor,
): Promise<{ saved: true }> {
  operatorOnly(actor);
  // Historical issued invoices and previously delivered emails retain their public logo bytes.
  await getSql()`update settings set logo_id=null`;
  return { saved: true };
}
