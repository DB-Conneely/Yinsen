import nextEnv from "@next/env";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

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
  env: {
    ...runtimeEnvironment,
    STORAGE_LOCAL_PATH: resolve(
      runtimeEnvironment.STORAGE_LOCAL_PATH || "./data/uploads",
    ),
  },
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
