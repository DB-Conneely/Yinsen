import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tsx = resolve("node_modules/tsx/dist/cli.mjs");

describe("installed standalone commands", () => {
  it("copies static assets and removes only generated dotenv copies", () => {
    const root = mkdtempSync(join(tmpdir(), "yinsen-packaging-"));
    mkdirSync(join(root, ".next/static"), { recursive: true });
    mkdirSync(join(root, ".next/standalone"), { recursive: true });
    writeFileSync(join(root, ".next/static/asset.css"), "body{color:black}");
    writeFileSync(join(root, ".env"), "APP_ORIGIN=http://localhost:3000");
    for (const name of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
    ]) {
      writeFileSync(
        join(root, ".next/standalone", name),
        "synthetic-build-value",
      );
    }
    const result = spawnSync(
      process.execPath,
      [tsx, resolve("scripts/standalone.ts")],
      { cwd: root },
    );
    expect(result.status, result.stderr.toString()).toBe(0);
    expect(
      readFileSync(
        join(root, ".next/standalone/.next/static/asset.css"),
        "utf8",
      ),
    ).toBe("body{color:black}");
    expect(readFileSync(join(root, ".env"), "utf8")).toContain("APP_ORIGIN=");
    for (const name of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
    ]) {
      expect(() =>
        readFileSync(join(root, ".next/standalone", name)),
      ).toThrow();
    }
  });

  it("starts the generated server with current root production environment and propagates failure", () => {
    const root = mkdtempSync(join(tmpdir(), "yinsen-launcher-"));
    mkdirSync(join(root, ".next/standalone"), { recursive: true });
    writeFileSync(
      join(root, ".env.production"),
      "YINSEN_LAUNCHER_PROBE=current-root\nPOSTGRES_PASSWORD=synthetic-admin\nMIGRATION_PASSWORD=synthetic-migrator\nMIGRATION_DATABASE_URL=synthetic-url\nRUNTIME_PASSWORD=synthetic-runtime",
    );
    writeFileSync(
      join(root, ".next/standalone/server.js"),
      "process.stdout.write(JSON.stringify({probe:process.env.YINSEN_LAUNCHER_PROBE, storagePath:process.env.STORAGE_LOCAL_PATH, secretNames:Object.keys(process.env).filter(name => ['POSTGRES_PASSWORD','MIGRATION_PASSWORD','MIGRATION_DATABASE_URL','RUNTIME_PASSWORD'].includes(name))})); process.exitCode = 7;",
    );
    const result = spawnSync(
      process.execPath,
      [tsx, resolve("scripts/start.ts")],
      {
        cwd: root,
        env: { PATH: process.env.PATH, NODE_ENV: "production" },
      },
    );
    const output: unknown = JSON.parse(result.stdout.toString());
    expect(output).toEqual({
      probe: "current-root",
      storagePath: join(root, "data/uploads"),
      secretNames: [],
    });
    expect(result.status, result.stderr.toString()).toBe(7);
  });
});
