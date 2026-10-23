import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationIdentity } from "../src/lib/release";

const tsx = resolve("node_modules/tsx/dist/cli.mjs");

describe("packaged MIT license verification", () => {
  it.each([
    ["exact", "exact", true],
    ["missing", "exact", false],
    ["changed", "exact", false],
    ["exact", "missing", false],
    ["exact", "changed", false],
  ] as const)(
    "requires exact license bytes: runtime=%s, tools=%s",
    (runtimeLicense, toolsLicense, passes) => {
      const root = mkdtempSync(join(tmpdir(), "yinsen-package-license-"));
      const runtime = `sha256:${"b".repeat(64)}`;
      const tools = `sha256:${"c".repeat(64)}`;
      const identity = {
        format: 1,
        version: "0.1.0",
        sourceRevision: "a".repeat(40),
        sourceDirty: false,
        releaseSequence: 1,
        ...migrationIdentity(),
      };
      writeFileSync(join(root, "identity.json"), JSON.stringify(identity));
      writeFileSync(
        join(root, "artifacts.json"),
        JSON.stringify({
          format: 1,
          identity,
          runtime: { image: runtime, id: runtime },
          tools: { image: tools, id: tools },
        }),
      );
      copyFileSync(resolve("LICENSE"), join(root, "LICENSE"));
      for (const [kind, license] of [
        ["runtime", runtimeLicense],
        ["tools", toolsLicense],
      ]) {
        if (license !== "missing") {
          const bytes = readFileSync(join(root, "LICENSE"));
          writeFileSync(
            join(root, `${kind}-LICENSE`),
            license === "changed" ? bytes.subarray(0, bytes.length - 1) : bytes,
          );
        }
      }
      // Only Docker is substituted; the real package CLI reads image bytes.
      writeFileSync(
        join(root, "docker"),
        `#!${process.execPath}
import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "image") process.stdout.write(args.at(-1));
else if (args.at(-1) === "/app/release.json") process.stdout.write(readFileSync("identity.json"));
else if (args.at(-1) === "/app/LICENSE") {
  const kind = args.at(-2) === "${runtime}" ? "runtime" : "tools";
  process.stdout.write(readFileSync(kind + "-LICENSE"));
} else process.exitCode = 2;
`,
        { mode: 0o700 },
      );
      const result = spawnSync(
        process.execPath,
        [tsx, resolve("scripts/package.ts"), "verify"],
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: root,
            PACKAGE_DIRECTORY: root,
          },
          encoding: "utf8",
        },
      );
      expect(result.status, result.stderr).toBe(passes ? 0 : 1);
      if (!passes)
        expect(result.stderr).toContain(
          runtimeLicense === "missing" || toolsLicense === "missing"
            ? "ENOENT"
            : "Packaged LICENSE must match the root LICENSE byte-for-byte.",
        );
    },
  );
});

function copyFontLicenses(root: string): void {
  mkdirSync(join(root, "src/app/fonts"), { recursive: true });
  for (const name of [
    "Inter-LICENSE.txt",
    "SourceSans3-LICENSE.txt",
    "SourceSerif4-LICENSE.txt",
  ])
    copyFileSync(
      resolve("src/app/fonts", name),
      join(root, "src/app/fonts", name),
    );
}

describe("installed standalone commands", () => {
  it("copies static assets and removes only generated dotenv copies", () => {
    const root = mkdtempSync(join(tmpdir(), "yinsen-packaging-"));
    mkdirSync(join(root, ".next/static"), { recursive: true });
    mkdirSync(join(root, ".next/standalone"), { recursive: true });
    copyFontLicenses(root);
    writeFileSync(join(root, ".next/static/asset.css"), "body{color:black}");
    writeFileSync(join(root, ".env"), "APP_ORIGIN=http://localhost:3000");
    writeFileSync(join(root, "release.json"), '{"sourceRevision":null}');
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
    for (const name of [
      "Inter-LICENSE.txt",
      "SourceSans3-LICENSE.txt",
      "SourceSerif4-LICENSE.txt",
    ])
      expect(
        readFileSync(
          join(root, ".next/standalone/.next/static/font-licenses", name),
        ),
      ).toEqual(readFileSync(resolve("src/app/fonts", name)));
    expect(
      readFileSync(
        join(root, ".next/standalone/.next/static/asset.css"),
        "utf8",
      ),
    ).toBe("body{color:black}");
    expect(readFileSync(join(root, ".env"), "utf8")).toContain("APP_ORIGIN=");
    expect(
      readFileSync(join(root, ".next/standalone/release.json"), "utf8"),
    ).toBe('{"sourceRevision":null}');
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

  it("refuses a standalone artifact containing private source uploads or records", () => {
    const root = mkdtempSync(join(tmpdir(), "yinsen-private-trace-"));
    mkdirSync(join(root, ".next/static"), { recursive: true });
    mkdirSync(join(root, ".next/standalone/data/uploads"), { recursive: true });
    copyFontLicenses(root);
    mkdirSync(join(root, ".next/standalone/docs"), { recursive: true });
    writeFileSync(join(root, "release.json"), '{"sourceRevision":null}');
    writeFileSync(
      join(root, ".next/standalone/data/uploads/private-sentinel"),
      "synthetic-private-upload",
    );
    writeFileSync(
      join(root, ".next/standalone/docs/private-sentinel"),
      "synthetic-private-record",
    );
    const result = spawnSync(
      process.execPath,
      [tsx, resolve("scripts/standalone.ts")],
      { cwd: root },
    );
    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toContain(
      "Unexpected standalone project paths: data, docs.",
    );
    expect(
      readFileSync(
        join(root, ".next/standalone/data/uploads/private-sentinel"),
        "utf8",
      ),
    ).toBe("synthetic-private-upload");
  });
});
