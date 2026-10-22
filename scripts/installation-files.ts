import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, lstat, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { StorageConfiguration } from "../src/lib/config";
import { ConfigurationError } from "../src/lib/errors";
import type { FileReference, Snapshot } from "./operations-contract";

export async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const value of createReadStream(path)) {
    const bytes: unknown = value;
    if (!(bytes instanceof Uint8Array))
      throw new ConfigurationError("Unexpected checkpoint byte stream.");
    hash.update(bytes);
  }
  return hash.digest("hex");
}

export function safePath(root: string, path: string): string {
  const result = resolve(root, path);
  if (
    !path ||
    path.includes("\\") ||
    path.startsWith("/") ||
    relative(resolve(root), result).startsWith("..")
  )
    throw new ConfigurationError("Unsafe checkpoint file path.");
  return result;
}

export async function inventory(
  root: string,
  directory = root,
): Promise<Snapshot["inventory"]> {
  const result: Snapshot["inventory"] = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name),
      metadata = await lstat(path);
    if (
      metadata.isSymbolicLink() ||
      (!metadata.isDirectory() && !metadata.isFile())
    )
      throw new ConfigurationError(
        "Checkpoint contains an unsupported link or special file.",
      );
    if (metadata.isDirectory()) result.push(...(await inventory(root, path)));
    else
      result.push({
        path: relative(root, path),
        size: metadata.size,
        sha256: await hashFile(path),
      });
  }
  return result;
}

export async function copyRemoteFiles(
  files: FileReference[],
  directory: string,
  config: StorageConfiguration,
): Promise<void> {
  const remote = files.filter((file) => file.driver === "s3");
  if (!remote.length) return;
  if (config.driver !== "s3")
    throw new ConfigurationError(
      "Retained S3 files require the original private storage configuration.",
    );
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint
      ? { endpoint: config.endpoint, forcePathStyle: true }
      : {}),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    retryMode: "standard",
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 60000 },
  });
  try {
    for (const file of remote) {
      const path = safePath(directory, `objects/${file.key}`);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: file.key }),
      );
      if (
        !(response.Body instanceof Readable) ||
        response.ContentLength !== file.size
      )
        throw new ConfigurationError(
          "Retained S3 object is absent or changed.",
        );
      await pipeline(
        response.Body,
        createWriteStream(path, { flags: "wx", mode: 0o600 }),
      );
    }
  } finally {
    client.destroy();
  }
}

export async function verifySnapshot(
  directory: string,
  snapshot: Snapshot,
): Promise<void> {
  if (
    (await hashFile(join(directory, "database.dump"))) !==
    snapshot.databaseSha256
  )
    throw new ConfigurationError("Checkpoint database checksum mismatch.");
  const actual = await inventory(join(directory, "files"));
  if (JSON.stringify(actual) !== JSON.stringify(snapshot.inventory))
    throw new ConfigurationError("Checkpoint file inventory mismatch.");
  for (const file of snapshot.files) {
    const path = safePath(
      join(directory, "files"),
      `${file.driver === "local" ? "local" : "objects"}/${file.key}`,
    );
    const metadata = await lstat(path);
    if (
      !metadata.isFile() ||
      metadata.size !== file.size ||
      (await hashFile(path)) !== file.sha256
    )
      throw new ConfigurationError(
        "Checkpoint retained file checksum mismatch.",
      );
  }
  // An encrypted configuration is part of each checkpoint, never a plaintext secret dump.
  if (!(await readFile(join(directory, "installation.cred"))).length)
    throw new ConfigurationError("Checkpoint credential is absent.");
}
