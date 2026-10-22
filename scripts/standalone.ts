import { cpSync, rmSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
cpSync("release.json", ".next/standalone/release.json");
// Next traces build-time dotenv files; runtime must use the current environment.
for (const name of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
]) {
  rmSync(`.next/standalone/${name}`, { force: true });
}
