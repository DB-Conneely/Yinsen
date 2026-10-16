import nextEnv from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { databaseConnection } from "../src/lib/config";
import { AppError, ConfigurationError } from "../src/lib/errors";
import { assertSchema } from "../src/lib/db/status";

nextEnv.loadEnvConfig(process.cwd());
const action = process.argv[2];
let sql: postgres.Sql | undefined;
try {
  if (action !== "migrate" && action !== "status")
    throw new ConfigurationError("Use db:migrate or db:status.");
  const config = databaseConnection(
    process.env.MIGRATION_DATABASE_URL ?? "",
    process.env.DATABASE_SSL ?? "verify-full",
  );
  sql = postgres(config.databaseUrl, {
    ssl: config.ssl,
    max: 1,
    connect_timeout: 5,
    onnotice: () => undefined,
  });
  if (action === "migrate") {
    await sql`select pg_advisory_lock(19371101)`;
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    await sql`grant usage on schema drizzle to yinsen_runtime`;
    await sql`grant select on drizzle.__drizzle_migrations to yinsen_runtime`;
  }
  const count = await assertSchema(sql);
  process.stdout.write(`Database schema current: ${count} migration(s).\n`);
} catch (error: unknown) {
  process.stderr.write(
    `${error instanceof AppError ? error.message : "Database operation failed. Check connectivity and migration privileges."}\n`,
  );
  process.exitCode = 1;
} finally {
  await sql?.end({ timeout: 5 });
}
