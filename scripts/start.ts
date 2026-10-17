import nextEnv from "@next/env";
import { spawn } from "node:child_process";

nextEnv.loadEnvConfig(process.cwd());
const {
  POSTGRES_PASSWORD: _adminPassword,
  MIGRATION_PASSWORD: _migrationPassword,
  MIGRATION_DATABASE_URL: _migrationUrl,
  RUNTIME_PASSWORD: _runtimePassword,
  ...runtimeEnvironment
} = process.env;
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  env: runtimeEnvironment,
});
child.on("error", () => {
  process.stderr.write(
    "Production runtime could not start. Run npm run build.\n",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});
process.on("SIGINT", () => {
  child.kill("SIGINT");
});
