import { getDb } from "./db/client";
import { settings } from "./db/schema";

export type Branding = typeof settings.$inferSelect;

export async function getBranding(): Promise<Branding | null> {
  const rows = await getDb().select().from(settings);
  return rows[0] ?? null;
}
