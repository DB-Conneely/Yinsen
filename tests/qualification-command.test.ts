import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tsx = resolve("node_modules/tsx/dist/cli.mjs");
const commandModule = resolve("scripts/qualification-command.ts");

function execute(
  program: string,
  args: string[],
): { result: SpawnSyncReturns<string>; logfile: string } {
  const logfile = join(
    mkdtempSync(join(tmpdir(), "yinsen-command-")),
    "child.log",
  );
  const result = spawnSync(
    process.execPath,
    [
      tsx,
      "--eval",
      `import { qualificationCommand } from ${JSON.stringify(commandModule)}; process.stdout.write(qualificationCommand(${JSON.stringify(program)}, ${JSON.stringify(args)}, process.env, ${JSON.stringify(logfile)}));`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PROBE_SHORT_SECRET: "synthetic",
        PROBE_SECRET: "synthetic-private-credential",
      },
    },
  );
  return { result, logfile };
}

describe("qualification subprocess diagnostics", () => {
  it("returns actual successful subprocess output and keeps its private log", () => {
    const { result, logfile } = execute(process.execPath, [
      "-e",
      "process.stdout.write('completed')",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("completed");
    expect(readFileSync(logfile, "utf8")).toContain("completed");
    expect(statSync(logfile).mode & 0o777).toBe(0o600);
  });

  it("preserves failure while surfacing bounded diagnostics without credentials", () => {
    const { result, logfile } = execute(process.execPath, [
      "-e",
      "process.stdout.write('x'.repeat(20000)); process.stderr.write('diagnostic: '+process.env.PROBE_SECRET+' postgresql://user:password@localhost/db Bearer synthetic-token '+ 'a'.repeat(64)); process.exitCode=7;",
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("diagnostic: [REDACTED]");
    expect(result.stderr).toContain("7 !== 0");
    expect(result.stderr).not.toContain("synthetic-private-credential");
    expect(result.stderr).not.toContain("user:password");
    expect(result.stderr).not.toContain("synthetic-token");
    expect(result.stderr).not.toContain("a".repeat(64));
    expect(result.stderr.length).toBeLessThan(20000);
    expect(readFileSync(logfile, "utf8")).toContain(
      "synthetic-private-credential",
    );
    expect(statSync(logfile).mode & 0o777).toBe(0o600);
  });

  it("reports a missing executable instead of losing the spawn error", () => {
    const { result } = execute("/nonexistent/yinsen-command", []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ENOENT");
  });

  it("explains the source marker scan prerequisite when rg is unavailable", () => {
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/check-markers.mjs")],
      {
        encoding: "utf8",
        env: { PATH: "/nonexistent", NODE_ENV: "test" },
      },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Install ripgrep (rg)");
  });
});
