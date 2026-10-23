import { setupSchema } from "../auth/validation";
import { hashPassword } from "../auth/password";
import {
  createOperatorSession,
  type Session,
  type OperatorIdentity,
} from "../auth/session";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { defaultAppearance } from "../appearance";

export async function isSetupComplete(): Promise<boolean> {
  const rows = await getSql()`select singleton from operator`;
  return rows.length === 1;
}

export async function completeSetup(
  input: unknown,
): Promise<{ user: OperatorIdentity; session: Session }> {
  const data = setupSchema.parse(input);
  return getSql().begin(async (sql) => {
    // All setup contenders serialize on the existing installation row.
    await sql`select singleton from installation where singleton = true for update`;
    if ((await sql`select singleton from operator`).length)
      throw new AppError(409, "SETUP_COMPLETED", "Setup already completed.");
    const passwordHash = await hashPassword(data.password);
    const rows = await sql<
      { id: string; name: string; email: string }[]
    >`insert into operator (name, email, password_hash) values (${data.name}, ${data.email}, ${passwordHash}) returning id, name, email`;
    const user = rows[0];
    if (!user)
      throw new AppError(500, "SETUP_FAILED", "Setup could not be completed.");
    await sql`insert into settings (brand_name, brand_colour, default_currency, welcome_text, dark_palette, dark_background, dark_surface) values (${data.brandName}, ${data.brandColour}, ${data.defaultCurrency}, ${data.welcomeText}, ${defaultAppearance.darkPalette}, ${defaultAppearance.darkBackground}, ${defaultAppearance.darkSurface})`;
    const session = await createOperatorSession(user.id, sql);
    return { user: { ...user, role: "operator" as const }, session };
  });
}
