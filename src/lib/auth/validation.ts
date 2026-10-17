import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .refine(
    (password) => new TextEncoder().encode(password).length <= 72,
    "Password must fit within 72 UTF-8 bytes.",
  );
export const loginSchema = z
  .object({ email: emailSchema, password: passwordSchema })
  .strict();
export const setupSchema = loginSchema
  .extend({
    name: z.string().trim().min(1).max(100),
    brandName: z.string().trim().min(1).max(100).default("Portal"),
    brandColour: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#2457A7"),
    defaultCurrency: z
      .enum([
        "GBP",
        "USD",
        "EUR",
        "CAD",
        "AUD",
        "NZD",
        "JPY",
        "CHF",
        "ZAR",
        "INR",
      ])
      .default("GBP"),
    welcomeText: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .default("Welcome to your client portal."),
  })
  .strict();

export function passwordStrength(password: string): string {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length >= 16) return "Strong length. Use a unique password.";
  return "Longer is stronger. Try a unique passphrase of 16 or more characters.";
}
