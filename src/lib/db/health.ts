import { eq } from "drizzle-orm";
import { getDb, getSql } from "./client";
import { installation } from "./schema";
import { assertSchema } from "./status";
import { AppError, DatabaseError, SchemaError } from "../errors";

export async function checkDatabase(): Promise<void> {
  try {
    await assertSchema(getSql());
    const rows = await getDb()
      .select({ createdAt: installation.createdAt })
      .from(installation)
      .where(eq(installation.singleton, true));
    if (rows.length !== 1) throw new SchemaError();
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    throw new DatabaseError();
  }
}
