import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { migrationIdentity, releaseIdentitySchema } from "../src/lib/release";
import { sha256, type Artifacts } from "../scripts/operations-contract";

const identity = releaseIdentitySchema.parse({
  format: 1,
  version: "0.1.0",
  sourceRevision: "a".repeat(40),
  sourceDirty: false,
  releaseSequence: 3,
  ...migrationIdentity(),
});
const runtime = `sha256:${"b".repeat(64)}`;
const tools = `sha256:${"c".repeat(64)}`;
const published: Artifacts = {
  format: 1,
  identity,
  runtime: {
    image: `ghcr.io/example/runtime@sha256:${"d".repeat(64)}`,
    id: `sha256:${"e".repeat(64)}`,
  },
  tools: {
    image: `ghcr.io/example/tools@sha256:${"f".repeat(64)}`,
    id: `sha256:${"a".repeat(64)}`,
  },
};
const local: Artifacts = {
  ...published,
  runtime: { image: runtime, id: runtime },
  tools: { image: tools, id: tools },
};
const recordedPublished: Artifacts = {
  ...published,
  runtime: { ...published.runtime, id: `sha256:${"8".repeat(64)}` },
  tools: { ...published.tools, id: `sha256:${"9".repeat(64)}` },
};
type State = "discovered" | "local" | "published";
type Mismatch = "none" | "runtime" | "tools" | "source" | "embedded" | "older";

async function inputs(
  state: State,
  mismatch: Mismatch,
): Promise<{ directory: string; stateDirectory: string; approved: Artifacts }> {
  const directory = await mkdtemp(join(tmpdir(), "yinsen-update-cli-"));
  const stateDirectory = join(directory, "state");
  await mkdir(stateDirectory, { mode: 0o700 });
  const approved: Artifacts = {
    ...published,
    identity: {
      ...identity,
      ...(mismatch === "source" ? { sourceRevision: "d".repeat(40) } : {}),
      ...(mismatch === "older" ? { releaseSequence: 2 } : {}),
    },
  };
  const manifest = JSON.stringify(approved);
  await writeFile(join(directory, "release.json"), manifest);
  await writeFile(
    join(directory, "receipt.json"),
    JSON.stringify({ passed: true, artifactsSha256: sha256(manifest) }),
  );
  await writeFile(join(directory, "installation.cred"), "encrypted fixture", {
    mode: 0o600,
  });
  await writeFile(
    join(directory, "installation.json"),
    JSON.stringify({
      format: 1,
      project: "yinsen_test_duplicate",
      credentialFile: "installation.cred",
      stateDirectory: "state",
      backupDirectory: "checkpoints",
    }),
    { mode: 0o600 },
  );
  if (state !== "discovered")
    await writeFile(
      join(stateDirectory, "active.json"),
      JSON.stringify(state === "local" ? local : recordedPublished),
      { mode: 0o600 },
    );
  return { directory, stateDirectory, approved };
}

function dockerBoundary(
  approved: Artifacts,
  mismatch: Mismatch,
): { calls: string[][]; execute: (args: string[]) => string } {
  const calls: string[][] = [];
  const candidateRuntime = ["runtime", "source", "older", "embedded"].includes(
    mismatch,
  )
    ? `sha256:${"1".repeat(64)}`
    : runtime;
  const candidateTools = ["tools", "source", "older"].includes(mismatch)
    ? `sha256:${"2".repeat(64)}`
    : tools;
  const execute = (args: string[]): string => {
    calls.push(args);
    if (args[0] === "pull") return "";
    if (args[0] === "compose" && args.at(-4) === "ps") return "3".repeat(64);
    if (args[0] === "inspect")
      return args[2] === "{{.Image}}" ? runtime : "yinsen_test_duplicate";
    if (args[0] === "image" && args[1] === "inspect") {
      const reference = args.at(-1);
      if (reference === published.runtime.image) return candidateRuntime;
      if (reference === published.tools.image) return candidateTools;
      if (reference === runtime || reference === tools) return reference;
    }
    if (args[0] === "run" && args.at(-1) === "/app/release.json") {
      const candidate =
        args.at(-2) === candidateRuntime || args.at(-2) === candidateTools;
      return JSON.stringify(
        mismatch === "embedded" && args.at(-2) === candidateRuntime
          ? { ...identity, sourceRevision: "f".repeat(40) }
          : candidate && ["source", "older"].includes(mismatch)
            ? approved.identity
            : identity,
      );
    }
    throw new Error(`Unexpected Docker mutation/operation: ${args.join(" ")}`);
  };
  return { calls, execute };
}

describe("installed update CLI duplicate identity", () => {
  it.each([
    ["discovered", "none", null],
    ["local", "none", null],
    ["published", "none", null],
    ["local", "runtime", "already bound"],
    ["local", "tools", "already bound"],
    ["local", "source", "already bound"],
    ["discovered", "embedded", "Artifact bytes"],
    ["local", "older", "Older or unordered"],
  ] as const)("state=%s, candidate=%s", async (state, mismatch, error) => {
    const fixture = await inputs(state, mismatch);
    const docker = dockerBoundary(fixture.approved, mismatch);
    const sql = Object.assign(
      vi.fn((query: TemplateStringsArray) => {
        expect(query.join("")).toContain("select allow_automatic_updates");
        return Promise.resolve([{ allow_automatic_updates: true }]);
      }),
      { end: vi.fn(() => Promise.resolve()) },
    );
    vi.resetModules();
    vi.doMock("postgres", () => ({ default: () => sql }));
    vi.doMock("node:child_process", () => ({
      execFileSync: (command: string, args: string[]) => {
        if (command === "flock") return "";
        if (command === "systemd-creds")
          return `COMPOSE_PROJECT_NAME=yinsen_test_duplicate\nPOSTGRES_DB=yinsen_test_duplicate\nRUNTIME_PASSWORD=synthetic\nAPP_ORIGIN=http://localhost:3240\nYINSEN_TOOLS_IMAGE=${tools}\n`;
        if (command === "docker") return docker.execute(args.slice(2));
        throw new Error(`Unexpected external command: ${command}`);
      },
    }));
    vi.stubEnv("XDG_RUNTIME_DIR", fixture.directory);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(Response.json({ data: { release: identity } })),
      ),
    );
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const argv = process.argv;
    const exitCode = process.exitCode;
    process.exitCode = 0;
    process.argv = [
      process.execPath,
      "scripts/installation.ts",
      "update",
      join(fixture.directory, "installation.json"),
      join(fixture.directory, "release.json"),
      join(fixture.directory, "receipt.json"),
    ];
    try {
      await import("../scripts/installation");
      expect(process.exitCode, JSON.stringify(stderr.mock.calls)).toBe(
        error ? 1 : 0,
      );
      if (error) expect(stderr.mock.calls.flat().join("")).toContain(error);
      else {
        expect(stdout.mock.calls.flat().join("")).toContain(
          "Release already installed",
        );
        expect(docker.calls).toContainEqual(["pull", published.runtime.image]);
        expect(docker.calls).toContainEqual(["pull", published.tools.image]);
      }
      expect(sql.end).toHaveBeenCalled();
      await expect(
        readFile(join(fixture.stateDirectory, "journal.json")),
      ).rejects.toThrow("ENOENT");
      if (state !== "discovered")
        expect(
          await readFile(join(fixture.stateDirectory, "active.json"), "utf8"),
        ).toBe(JSON.stringify(state === "local" ? local : recordedPublished));
    } finally {
      process.argv = argv;
      process.exitCode = exitCode;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.doUnmock("postgres");
      vi.doUnmock("node:child_process");
    }
  });
});
