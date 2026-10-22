import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

export function qualificationCommand(
  program: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  logfile: string,
): string {
  const result = spawnSync(program, args, {
    env: environment,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
  writeFileSync(logfile, output, { mode: 0o600 });
  if (result.status !== 0) {
    let diagnostic = output;
    for (const [key, value] of Object.entries(environment).sort(
      ([, left], [, right]) => (right?.length ?? 0) - (left?.length ?? 0),
    )) {
      if (value && /PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL/i.test(key))
        diagnostic = diagnostic.split(value).join("[REDACTED]");
    }
    diagnostic = diagnostic
      .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]")
      .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
      .replace(/\b[a-f0-9]{64}\b/gi, "[REDACTED_TOKEN]");
    process.stderr.write(
      `Qualification subprocess diagnostics (redacted tail):\n${diagnostic.slice(-16000)}\n`,
    );
  }
  assert.equal(
    result.status,
    0,
    `Qualification subprocess failed; inspect ${logfile}.`,
  );
  return result.stdout ?? "";
}
