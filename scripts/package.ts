import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { artifactSetSchema, releaseIdentitySchema } from "../src/lib/release";

const directory = resolve(process.env.PACKAGE_DIRECTORY ?? ".local/package");
const artifactsPath = `${directory}/artifacts.json`;
function run(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}
function save(name: string, value: unknown): void {
  writeFileSync(`${directory}/${name}`, JSON.stringify(value, null, 2) + "\n");
}
function identity(image: string): unknown {
  return JSON.parse(
    run(["run", "--rm", "--entrypoint", "cat", image, "/app/release.json"]),
  );
}
function verify(): ReturnType<typeof artifactSetSchema.parse> {
  const artifacts = artifactSetSchema.parse(
    JSON.parse(readFileSync(artifactsPath, "utf8")),
  );
  assert.equal(
    artifacts.identity.sourceDirty,
    false,
    "Dirty source cannot be released.",
  );
  assert.ok(
    artifacts.identity.sourceRevision && artifacts.identity.releaseSequence,
  );
  for (const artifact of [artifacts.runtime, artifacts.tools]) {
    const resolved = run([
      "image",
      "inspect",
      "--format",
      "{{.Id}}",
      artifact.image,
    ]).trim();
    // Local IDs belong to this engine; a pinned registry reference resolves on the target.
    if (artifact.image.startsWith("sha256:"))
      assert.equal(resolved, artifact.id);
    assert.deepEqual(
      identity(resolved),
      artifacts.identity,
      "Runtime/tools identity mismatch.",
    );
  }
  return artifacts;
}
function buildImage(target: string, revision: string, sequence: number): void {
  execFileSync(
    "docker",
    [
      "build",
      "--target",
      target,
      "--build-arg",
      `SOURCE_REVISION=${revision}`,
      "--build-arg",
      `RELEASE_SEQUENCE=${sequence}`,
      "--tag",
      `yinsen-${target}:${revision}`,
      ".",
    ],
    { stdio: "inherit" },
  );
}
function localImage(
  target: string,
  revision: string,
): { image: string; id: string } {
  const id = run([
    "image",
    "inspect",
    "--format",
    "{{.Id}}",
    `yinsen-${target}:${revision}`,
  ]).trim();
  return { image: id, id };
}
function build(): void {
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
    "",
    "Commit source before packaging.",
  );
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const sequence = Number(process.env.RELEASE_SEQUENCE);
  assert.ok(
    Number.isSafeInteger(sequence) && sequence > 0,
    "Set a positive monotonic RELEASE_SEQUENCE.",
  );
  for (const target of ["tools", "runtime"]) {
    buildImage(target, revision, sequence);
  }
  const runtime = localImage("runtime", revision),
    tools = localImage("tools", revision);
  save("artifacts.json", {
    format: 1,
    identity: releaseIdentitySchema.parse(identity(runtime.id)),
    runtime,
    tools,
  });
  verify();
  run(["save", "--output", `${directory}/images.tar`, runtime.id, tools.id]);
}
function publishImage(
  name: string,
  id: string,
  revision: string,
): { image: string; id: string } {
  const tag = `${name}:${revision}`;
  run(["tag", id, tag]);
  execFileSync("docker", ["push", tag], { stdio: "inherit" });
  const digests: unknown = JSON.parse(
    run(["image", "inspect", "--format", "{{json .RepoDigests}}", tag]),
  );
  assert.ok(Array.isArray(digests));
  const reference: unknown = digests.find(
    (item: unknown) =>
      typeof item === "string" && item.startsWith(name + "@sha256:"),
  );
  assert.equal(typeof reference, "string");
  run(["pull", String(reference)]);
  assert.equal(
    run(["image", "inspect", "--format", "{{.Id}}", String(reference)]).trim(),
    id,
    "Published digest must resolve to the qualified engine-selected image.",
  );
  return { image: String(reference), id };
}
function publish(): void {
  assert.equal(
    process.env.GITHUB_ACTIONS,
    "true",
    "Publication belongs to the user-controlled workflow.",
  );
  const artifacts = verify();
  const receipt: unknown = JSON.parse(
    readFileSync(`${directory}/qualification.json`, "utf8"),
  );
  assert.deepEqual(
    receipt,
    {
      passed: true,
      artifactsSha256: createHash("sha256")
        .update(readFileSync(artifactsPath))
        .digest("hex"),
    },
    "Exact artifacts must pass qualification before publication.",
  );
  const repository = process.env.GITHUB_REPOSITORY?.toLowerCase();
  assert.match(repository ?? "", /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/);
  const published = { ...artifacts };
  for (const kind of ["runtime", "tools"] as const) {
    const name = `ghcr.io/${repository}-${kind}`;
    assert.ok(artifacts.identity.sourceRevision);
    published[kind] = publishImage(
      name,
      artifacts[kind].id,
      artifacts.identity.sourceRevision,
    );
  }
  save("release.json", published);
}
mkdirSync(directory, { recursive: true, mode: 0o700 });
const action = process.argv[2];
if (action === "build") build();
else if (action === "verify") {
  verify();
  process.stdout.write("Exact runtime/tools identity verified.\n");
} else if (action === "publish") publish();
else assert.fail("Use package:build, package:verify or package:publish.");
