import { spawnSync } from "node:child_process";

const scan = spawnSync(
  "rg",
  [
    "-n",
    "TODO|FIXME|HACK|@ts-ignore|@ts-expect-error|eslint-disable|prettier-ignore|\\u00a0",
    "src",
    "scripts",
    "tests",
    "next.config.ts",
    "drizzle.config.ts",
    "vitest.config.ts",
    "--glob",
    "!check-markers.mjs",
  ],
  { stdio: "inherit" },
);
if (scan.error)
  process.stderr.write(
    `Marker scan could not start: ${scan.error.message}\nInstall ripgrep (rg) before running the source gates.\n`,
  );
if (scan.status !== 1) process.exit(scan.status === 0 ? 1 : (scan.status ?? 2));
