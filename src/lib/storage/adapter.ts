import { constants, createReadStream } from "node:fs";
import { mkdir, open, stat, unlink, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { readConfiguration, type StorageConfiguration } from "../config";
import { AppError } from "../errors";
import { logger } from "../logger";

export type StoredFile = {
  key: string;
  driver: "local" | "s3";
  size: number;
  mimeType: string;
};

function keyPath(key: string, config: StorageConfiguration): string {
  if (!/^(messages|deliverables)\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key))
    throw new AppError(400, "INVALID_FILE", "Invalid file reference.");
  return join(config.path, key);
}

function s3(config: StorageConfiguration): S3Client {
  if (config.driver !== "s3")
    throw new AppError(
      503,
      "STORAGE_UNAVAILABLE",
      "This file requires the original S3 storage configuration.",
    );
  return new S3Client({
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
}

function unavailable(): AppError {
  return new AppError(
    503,
    "STORAGE_UNAVAILABLE",
    "File storage is unavailable. Please retry or contact the operator.",
  );
}

export async function putFile(
  file: StoredFile,
  stagedPath: string,
): Promise<void> {
  const config = readConfiguration().storage;
  const path = keyPath(file.key, config);
  try {
    if (file.driver === "local") {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await copyFile(stagedPath, path, constants.COPYFILE_EXCL);
    } else {
      const client = s3(config);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.driver === "s3" ? config.bucket : "",
            Key: file.key,
            Body: createReadStream(stagedPath),
            ContentLength: file.size,
            ContentType: file.mimeType,
            IfNoneMatch: "*",
          }),
        );
      } finally {
        client.destroy();
      }
    }
  } catch {
    throw unavailable();
  }
}

export async function getFile(
  file: StoredFile,
): Promise<ReadableStream<Uint8Array>> {
  const config = readConfiguration().storage;
  const path = keyPath(file.key, config);
  try {
    if (file.driver === "local") {
      const handle = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      if ((await handle.stat()).size !== file.size) {
        await handle.close();
        throw unavailable();
      }
      // CAST: Node's byte stream implements the Web byte-stream response contract.
      return Readable.toWeb(
        handle.createReadStream(),
      ) as ReadableStream<Uint8Array>;
    }
    const client = s3(config);
    try {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: config.driver === "s3" ? config.bucket : "",
          Key: file.key,
        }),
      );
      if (!result.Body || result.ContentLength !== file.size) {
        client.destroy();
        throw unavailable();
      }
      const body = result.Body.transformToWebStream();
      const reader = body.getReader();
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const part = await reader.read();
            if (part.done) {
              client.destroy();
              controller.close();
            } else {
              const value: unknown = part.value;
              if (!(value instanceof Uint8Array)) throw unavailable();
              controller.enqueue(value);
            }
          } catch {
            client.destroy();
            controller.error(unavailable());
          }
        },
        async cancel() {
          await reader.cancel();
          client.destroy();
        },
      });
    } catch {
      client.destroy();
      throw unavailable();
    }
  } catch {
    throw unavailable();
  }
}

// Only freshly failed writes or files from a confirmed committed deletion reach this caller.
export async function removeFailedFiles(files: StoredFile[]): Promise<void> {
  const config = readConfiguration().storage;
  for (const file of files) {
    try {
      const path = keyPath(file.key, config);
      if (file.driver === "local")
        await unlink(path).catch((error: unknown) => {
          if (!(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          ))
            throw error;
        });
      else {
        const client = s3(config);
        try {
          await client.send(
            new DeleteObjectCommand({
              Bucket: config.driver === "s3" ? config.bucket : "",
              Key: file.key,
            }),
          );
        } finally {
          client.destroy();
        }
      }
    } catch {
      logger.error(
        { event: "storage.cleanup_failed", key: file.key, driver: file.driver },
        "File cleanup failed; private orphan retained for operator recovery",
      );
    }
  }
}

export async function verifyStorage(): Promise<"local" | "s3"> {
  const config = readConfiguration().storage;
  try {
    await mkdir(config.path, { recursive: true, mode: 0o700 });
    if (!(await stat(config.path)).isDirectory()) throw unavailable();
    if (config.driver === "s3") {
      const client = s3(config);
      try {
        await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      } finally {
        client.destroy();
      }
    }
    return config.driver;
  } catch {
    throw unavailable();
  }
}
