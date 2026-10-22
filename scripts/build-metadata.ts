import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { version } from "../package.json";
import { migrationIdentity, releaseIdentitySchema } from "../src/lib/release";

function source(): { sourceRevision: string | null; sourceDirty: boolean } {
  if (process.env.YINSEN_SOURCE_REVISION)
    return {
      sourceRevision: process.env.YINSEN_SOURCE_REVISION,
      sourceDirty: false,
    };
  try {
    return {
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      sourceDirty: Boolean(
        execFileSync("git", ["status", "--porcelain"], {
          encoding: "utf8",
        }).trim(),
      ),
    };
  } catch {
    return { sourceRevision: null, sourceDirty: true };
  }
}

const identity = releaseIdentitySchema.parse({
  format: 1,
  version,
  ...source(),
  releaseSequence: process.env.YINSEN_RELEASE_SEQUENCE
    ? Number(process.env.YINSEN_RELEASE_SEQUENCE)
    : null,
  ...migrationIdentity(),
});
writeFileSync("release.json", JSON.stringify(identity, null, 2) + "\n");
