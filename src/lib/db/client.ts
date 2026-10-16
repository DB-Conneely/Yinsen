import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { readConfiguration } from "../config";

function connect(): postgres.Sql {
  const config = readConfiguration();
  return postgres(config.databaseUrl, {
    ssl: config.ssl,
    max: 5,
    connect_timeout: 5,
    idle_timeout: 20,
    connection: { statement_timeout: 5000, application_name: "yinsen" },
    onnotice: () => undefined,
  });
}

declare global {
  var yinsenSql: postgres.Sql | undefined;
}

export function getSql(): postgres.Sql {
  globalThis.yinsenSql ??= connect();
  return globalThis.yinsenSql;
}

export function getDb(): ReturnType<typeof drizzle> {
  return drizzle(getSql());
}
