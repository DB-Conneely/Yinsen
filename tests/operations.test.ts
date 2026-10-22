import { mkdtemp, mkdir, writeFile, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { migrationIdentity } from "../src/lib/release";
import {
  assertPrefix,
  releaseDecision,
  operationJournalSchema,
  sha256,
  type Artifacts,
} from "../scripts/operations-contract";
import {
  hashFile,
  inventory,
  safePath,
  verifySnapshot,
  copyRemoteFiles,
  requireDiskSpace,
} from "../scripts/installation-files";

const identity = {
  format: 1 as const,
  version: "0.1.0",
  sourceRevision: "a".repeat(40),
  sourceDirty: false,
  releaseSequence: 3,
  ...migrationIdentity(),
};
const artifacts: Artifacts = {
  format: 1,
  identity,
  runtime: {
    image: `sha256:${"b".repeat(64)}`,
    id: `sha256:${"b".repeat(64)}`,
  },
  tools: { image: `sha256:${"c".repeat(64)}`, id: `sha256:${"c".repeat(64)}` },
};

describe("installation recovery boundaries", () => {
  it("requires an explicit immutable forward target after activation and refuses ambiguous old journals", () => {
    const base = {
      format: 1,
      previous: artifacts,
      checkpoint: "/private/checkpoint",
    };
    expect(
      operationJournalSchema.parse({ ...base, phase: "retention" }).phase,
    ).toBe("retention");
    expect(
      operationJournalSchema.parse({
        ...base,
        phase: "activation",
        target: artifacts,
      }),
    ).toMatchObject({ target: artifacts });
    expect(
      operationJournalSchema.parse({
        ...base,
        phase: "restore",
        localCopy: true,
      }),
    ).toMatchObject({ localCopy: true });
    expect(
      operationJournalSchema.safeParse({ ...base, phase: "restore" }).success,
    ).toBe(false);
    expect(
      operationJournalSchema.safeParse({ ...base, phase: "activation" })
        .success,
    ).toBe(false);
    expect(
      operationJournalSchema.safeParse({ ...base, phase: "readiness" }).success,
    ).toBe(false);
    expect(
      operationJournalSchema.safeParse({
        ...base,
        phase: "activation",
        target: { ...artifacts, identity: { ...identity, sourceDirty: true } },
      }).success,
    ).toBe(false);
  });
  it("checks real disk availability before accepting bulk staging", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yinsen-capacity-"));
    await expect(requireDiskSpace(directory, 1)).resolves.toBeUndefined();
    await expect(
      requireDiskSpace(directory, Number.MAX_SAFE_INTEGER),
    ).rejects.toThrow("Insufficient");
    await expect(requireDiskSpace(directory, -1)).rejects.toThrow(
      "Insufficient",
    );
  });
  it("requires an unchanged ordered installed migration prefix", () => {
    const rows = identity.migrations
      .slice(0, 9)
      .map((m) => ({ hash: m.hash, created_at: String(m.createdAt) }));
    expect(() => assertPrefix(rows, identity)).not.toThrow();
    expect(() => assertPrefix([], identity)).not.toThrow();
    expect(() => assertPrefix([...rows].reverse(), identity)).toThrow(
      "supported exact prefix",
    );
    expect(() =>
      assertPrefix([{ hash: "f".repeat(64), created_at: "1" }], identity),
    ).toThrow();
  });
  it("rejects downgrade, reused sequence and rewritten migration history", () => {
    expect(releaseDecision(artifacts, artifacts)).toBe("duplicate");
    expect(
      releaseDecision(artifacts, {
        ...artifacts,
        identity: { ...identity, releaseSequence: 4 },
      }),
    ).toBe("update");
    expect(() =>
      releaseDecision(artifacts, {
        ...artifacts,
        identity: { ...identity, releaseSequence: 2 },
      }),
    ).toThrow("Older");
    expect(() =>
      releaseDecision(artifacts, {
        ...artifacts,
        identity: { ...identity, sourceRevision: "d".repeat(40) },
      }),
    ).toThrow("already bound");
    expect(() =>
      releaseDecision(artifacts, {
        ...artifacts,
        identity: {
          ...identity,
          releaseSequence: 4,
          migrations: identity.migrations.slice(1),
        },
      }),
    ).toThrow("rewrites");
  });
  it("verifies full retained file inventory and database bytes, rejecting tampering and links", async () => {
    const dir = await mkdtemp(join(tmpdir(), "yinsen-checkpoint-"));
    await mkdir(join(dir, "files", "local"), { recursive: true });
    await writeFile(
      join(dir, "files", "local", "retained-orphan"),
      "retained bytes",
    );
    await writeFile(join(dir, "database.dump"), "synthetic dump");
    await writeFile(
      join(dir, "installation.cred"),
      "encrypted credential fixture",
    );
    const snapshot = {
      format: 1 as const,
      project: "yinsen_test",
      createdAt: new Date().toISOString(),
      artifacts,
      files: [],
      facts: {},
      projections: {},
      inventory: await inventory(join(dir, "files")),
      databaseSha256: await hashFile(join(dir, "database.dump")),
    };
    expect(snapshot.databaseSha256).toBe(
      sha256(await readFile(join(dir, "database.dump"))),
    );
    await expect(verifySnapshot(dir, snapshot)).resolves.toBeUndefined();
    await writeFile(
      join(dir, "files", "local", "retained-orphan"),
      "changed bytes",
    );
    await expect(verifySnapshot(dir, snapshot)).rejects.toThrow(
      "inventory mismatch",
    );
    await symlink("/etc/passwd", join(dir, "files", "link"));
    await expect(inventory(join(dir, "files"))).rejects.toThrow(
      "unsupported link",
    );
    expect(() => safePath(dir, "../escape")).toThrow("Unsafe");
    expect(() => safePath(dir, "/absolute")).toThrow("Unsafe");
    expect(safePath(dir, "local/retained")).toBe(join(dir, "local/retained"));
    await expect(
      copyRemoteFiles([], dir, { driver: "local", path: dir, maxBytes: 100 }),
    ).resolves.toBeUndefined();
    await expect(
      copyRemoteFiles(
        [
          {
            key: `branding/${"a".repeat(36)}/${"b".repeat(36)}`,
            driver: "s3",
            size: 1,
            sha256: "a".repeat(64),
          },
        ],
        dir,
        { driver: "local", path: dir, maxBytes: 100 },
      ),
    ).rejects.toThrow("original private storage");
  });
});
