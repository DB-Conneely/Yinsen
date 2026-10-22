import nextEnv from "@next/env";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { databaseConnection } from "../src/lib/config";
import { getDb, getSql } from "../src/lib/db/client";
import { checkDatabase } from "../src/lib/db/health";
import { assertSchema } from "../src/lib/db/status";
import { installation } from "../src/lib/db/schema";
import {
  ConfigurationError,
  DatabaseError,
  SchemaError,
} from "../src/lib/errors";
import { GET } from "../src/app/api/health/route";
import RootLayout from "../src/app/layout";
import nextConfig from "../next.config";
import { register } from "../src/instrumentation";
import { logger, logFailure } from "../src/lib/logger";
import { readReleaseIdentity } from "../src/lib/release";

nextEnv.loadEnvConfig(process.cwd());
const connection = databaseConnection(
  process.env.MIGRATION_DATABASE_URL ?? "",
  process.env.DATABASE_SSL ?? "verify-full",
);
const owner = postgres(connection.databaseUrl, {
  ssl: connection.ssl,
  max: 1,
  onnotice: () => undefined,
});

afterAll(async (): Promise<void> => {
  await owner.end();
  await getSql().end();
});

describe("installed PostgreSQL foundation", () => {
  it("connects through the singleton runtime pool and reads the consumed schema", async () => {
    expect(getSql()).toBe(getSql());
    expect(await assertSchema(getSql())).toBeGreaterThan(0);
    const rows = await getDb().select().from(installation);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.singleton).toBe(true);
    await expect(checkDatabase()).resolves.toBeUndefined();
  });
  it("rejects migration tampering and rolls the fixture back", async () => {
    await owner.begin(async (transaction) => {
      await transaction`update drizzle.__drizzle_migrations set hash = 'synthetic-mismatch'`;
      await expect(assertSchema(transaction)).rejects.toBeInstanceOf(
        SchemaError,
      );
      await transaction`rollback`;
    });
    await expect(assertSchema(owner)).resolves.toBeGreaterThan(0);
  });
  it("enforces runtime DDL and ledger write denial", async () => {
    await expect(
      getSql()`create table forbidden_probe (id integer)`,
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      getSql()`update drizzle.__drizzle_migrations set hash = hash`,
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("enforces singleton constraint and default timestamp", async () => {
    await expect(
      owner`insert into installation (singleton) values (false)`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      owner`insert into installation default values`,
    ).rejects.toMatchObject({ code: "23505" });
    const rows = await owner<
      { created_at: Date }[]
    >`select created_at from installation`;
    expect(rows[0]?.created_at).toBeInstanceOf(Date);
  });
  it("reports connection failure safely", async () => {
    const absent = postgres("postgres://synthetic:secret@127.0.0.1:1/absent", {
      max: 1,
      connect_timeout: 1,
    });
    try {
      await expect(assertSchema(absent)).rejects.toBeInstanceOf(DatabaseError);
    } finally {
      await absent.end({ timeout: 1 });
    }
  });
  it("runs the actual startup hook and health handler", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await expect(register()).resolves.toBeUndefined();
    vi.unstubAllEnvs();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-Id")).toMatch(/^[\da-f-]{36}$/);
    expect(await response.json()).toEqual({
      data: {
        status: "healthy",
        version: "0.1.0",
        release: readReleaseIdentity(),
      },
      meta: null,
      error: null,
    });
  });
  it("logs a safe fatal code and exits when startup configuration is invalid", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("APP_ORIGIN", "invalid-secret-origin");
    const fatal = vi.spyOn(logger, "fatal").mockImplementation(() => undefined);
    const exit = vi.spyOn(process, "exit").mockImplementation((): never => {
      throw new ConfigurationError("synthetic process boundary");
    });
    try {
      await expect(register()).rejects.toThrow("synthetic process boundary");
      expect(exit).toHaveBeenCalledWith(1);
      expect(fatal).toHaveBeenCalledWith(
        { code: "CONFIGURATION_ERROR" },
        "Startup refused. Check configuration, database service and migration status.",
      );
    } finally {
      vi.unstubAllEnvs();
      fatal.mockRestore();
      exit.mockRestore();
    }
  });
});

describe("public rendering and safe logs", () => {
  it("renders the installed accessible root shell", () => {
    const html = renderToStaticMarkup(RootLayout({ children: "Portal" }));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Portal");
  });
  it("sets security headers through the real Next configuration", async () => {
    const headers = await nextConfig.headers?.();
    expect(headers?.[0]?.source).toBe("/(.*)");
    expect(headers?.[0]?.headers).toContainEqual({
      key: "X-Frame-Options",
      value: "DENY",
    });
    expect(headers?.[0]?.headers).toContainEqual({
      key: "Strict-Transport-Security",
      value: "max-age=31536000",
    });
  });
  it("logs only the explicit code and correlation ID", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    logFailure("DATABASE_UNAVAILABLE", "synthetic-correlation");
    expect(spy).toHaveBeenCalledWith(
      { code: "DATABASE_UNAVAILABLE", correlationId: "synthetic-correlation" },
      "Request failed",
    );
    spy.mockRestore();
  });
});
