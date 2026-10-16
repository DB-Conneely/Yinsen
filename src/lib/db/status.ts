import { readMigrationFiles } from "drizzle-orm/migrator";
import type postgres from "postgres";
import { SchemaError, DatabaseError } from "../errors";

export async function assertSchema(
  sql: postgres.Sql | postgres.TransactionSql,
): Promise<number> {
  const expected = readMigrationFiles({ migrationsFolder: "drizzle" });
  try {
    const exists = await sql<
      { ledger: string | null }[]
    >`select to_regclass('drizzle.__drizzle_migrations')::text as ledger`;
    if (!exists[0]?.ledger) throw new SchemaError();
    const rows = await sql<
      { hash: string; created_at: string }[]
    >`select hash, created_at from drizzle.__drizzle_migrations order by created_at, id`;
    if (
      !expected.length ||
      rows.length !== expected.length ||
      rows.some(
        (row, index) =>
          row.hash !== expected[index]?.hash ||
          Number(row.created_at) !== expected[index]?.folderMillis,
      )
    ) {
      throw new SchemaError();
    }
    return rows.length;
  } catch (error: unknown) {
    if (error instanceof SchemaError) throw error;
    throw new DatabaseError();
  }
}
