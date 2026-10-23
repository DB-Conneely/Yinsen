import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";

// OFL notices travel with the bundled font bytes in both standalone and Docker runtimes.
mkdirSync(".next/static/font-licenses", { recursive: true });
for (const name of [
  "Inter-LICENSE.txt",
  "SourceSans3-LICENSE.txt",
  "SourceSerif4-LICENSE.txt",
])
  cpSync(`src/app/fonts/${name}`, `.next/static/font-licenses/${name}`);
mkdirSync(".next/static/textures", { recursive: true });
cpSync(
  "public/textures/paper-grain.svg",
  ".next/static/textures/paper-grain.svg",
);
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
