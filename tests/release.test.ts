import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  artifactSetSchema,
  migrationIdentity,
  readReleaseIdentity,
  releaseIdentitySchema,
} from "../src/lib/release";

describe("release identity consumed by installed health/tools", () => {
  it("binds the complete ordered migration ledger and exposes honest unbuilt-source identity", () => {
    const migrations = migrationIdentity();
    expect(migrations.migrations).toHaveLength(12);
    expect(migrations.migrationDigest).toBe(
      createHash("sha256")
        .update(JSON.stringify(migrations.migrations))
        .digest("hex"),
    );
    const missing = join(
      mkdtempSync(join(tmpdir(), "yinsen-release-")),
      "missing.json",
    );
    expect(readReleaseIdentity(missing)).toMatchObject({
      sourceRevision: null,
      sourceDirty: true,
      releaseSequence: null,
      ...migrations,
    });
  });
  it("reads exact metadata and rejects malformed/source-spoofed metadata", () => {
    const path = join(
      mkdtempSync(join(tmpdir(), "yinsen-release-")),
      "release.json",
    );
    const identity = {
      format: 1,
      version: "0.1.0",
      sourceRevision: "a".repeat(40),
      sourceDirty: false,
      releaseSequence: 1,
      ...migrationIdentity(),
    };
    writeFileSync(path, JSON.stringify(identity));
    expect(readReleaseIdentity(path)).toEqual(identity);
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
    expect(() => readReleaseIdentity(path)).toThrow();
  });
});
