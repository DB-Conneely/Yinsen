import { cpSync, readdirSync, rmSync } from "node:fs";

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
// A widened file trace must fail the build before private project data ships.
const runtimeEntries = new Set([
  ".next",
  "drizzle",
  "node_modules",
  "package.json",
  "release.json",
  "server.js",
]);
const unexpected = readdirSync(".next/standalone").filter(
  (name) => !runtimeEntries.has(name),
);
if (unexpected.length) {
  process.stderr.write(
    `Unexpected standalone project paths: ${unexpected.join(", ")}.\n`,
  );
  process.exitCode = 1;
}
