import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  artifactSetSchema,
  migrationIdentity,
  releaseIdentitySchema,
} from "../src/lib/release";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "yinsen-release-"));
  symlinkSync(resolve("drizzle"), join(root, "drizzle"), "dir");
  return root;
}

function readIdentity(cwd: string): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [
      resolve("node_modules/tsx/dist/cli.mjs"),
      "--eval",
      `import { readReleaseIdentity } from ${JSON.stringify(resolve("src/lib/release.ts"))}; process.stdout.write(JSON.stringify(readReleaseIdentity()));`,
    ],
    { cwd },
  );
}

describe("release identity consumed by installed health/tools", () => {
  it("binds the complete ordered migration ledger and exposes honest unbuilt-source identity", () => {
    const migrations = migrationIdentity();
    expect(migrations.migrations).toHaveLength(13);
    expect(migrations.migrationDigest).toBe(
      createHash("sha256")
        .update(JSON.stringify(migrations.migrations))
        .digest("hex"),
    );
    const result = readIdentity(fixture());
    expect(result.status, result.stderr.toString()).toBe(0);
    const identity: unknown = JSON.parse(result.stdout.toString());
    expect(identity).toMatchObject({
      sourceRevision: null,
      sourceDirty: true,
      releaseSequence: null,
      ...migrations,
    });
  });
  it("reads exact metadata and rejects malformed/source-spoofed metadata", () => {
    const root = fixture();
    const path = join(root, "release.json");
    const identity = {
      format: 1,
      version: "0.1.0",
      sourceRevision: "a".repeat(40),
      sourceDirty: false,
      releaseSequence: 1,
      ...migrationIdentity(),
    };
    writeFileSync(path, JSON.stringify(identity));
    const result = readIdentity(root);
    expect(result.status, result.stderr.toString()).toBe(0);
    const actual: unknown = JSON.parse(result.stdout.toString());
    expect(actual).toEqual(identity);
    expect(
      releaseIdentitySchema.safeParse({ ...identity, releaseSequence: -1 })
        .success,
    ).toBe(false);
    expect(
      releaseIdentitySchema.safeParse({
        ...identity,
        sourceRevision: "unknown",
      }).success,
    ).toBe(false);
    expect(
      artifactSetSchema.safeParse({
        format: 1,
        identity,
        runtime: { image: "runtime", id: "mutable" },
        tools: { image: "tools", id: "mutable" },
      }).success,
    ).toBe(false);
    const image = {
      image: `sha256:${"b".repeat(64)}`,
      id: `sha256:${"b".repeat(64)}`,
    };
    const artifacts = { format: 1, identity, runtime: image, tools: image };
    expect(artifactSetSchema.safeParse(artifacts).success).toBe(true);
    expect(
      artifactSetSchema.safeParse({
        ...artifacts,
        runtime: { ...image, image: "registry.example/yinsen:latest" },
      }).success,
    ).toBe(false);
    expect(
      artifactSetSchema.safeParse({
        ...artifacts,
        runtime: {
          ...image,
          image: `registry.example/yinsen@sha256:${"c".repeat(64)}`,
        },
      }).success,
    ).toBe(true);
    expect(
      artifactSetSchema.safeParse({
        ...artifacts,
        runtime: { ...image, image: `sha256:${"c".repeat(64)}` },
      }).success,
    ).toBe(false);
    expect(
      artifactSetSchema.safeParse({
        ...artifacts,
        identity: { ...identity, sourceDirty: true },
      }).success,
    ).toBe(false);
    expect(
      releaseIdentitySchema.safeParse({
        ...identity,
        migrationDigest: "0".repeat(64),
      }).success,
    ).toBe(false);
    writeFileSync(path, "{}");
    expect(readIdentity(root).status).not.toBe(0);
  });
});
