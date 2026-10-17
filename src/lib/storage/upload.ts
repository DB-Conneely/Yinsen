import busboy from "busboy";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { join, extname } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { readConfiguration } from "../config";
import { AppError } from "../errors";
import { z } from "zod";

export type Upload = {
  path: string;
  filename: string;
  mimeType: string;
  size: number;
  sha256: string;
};
export type MessageUpload = {
  requestId: string;
  body: string;
  files: Upload[];
  cleanup: () => Promise<void>;
};
export type DeliverableUpload = {
  requestId: string;
  parentDeliverableId: string | null;
  files: Upload[];
  cleanup: () => Promise<void>;
};
const types: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".zip": "application/zip",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function invalid(message: string, status = 400): AppError {
  return new AppError(
    status,
    status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_UPLOAD",
    message,
  );
}

function storageFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    ["EACCES", "ENOSPC", "EIO", "EROFS", "EDQUOT"].includes(error.code)
  );
}

function unavailable(): AppError {
  return new AppError(
    503,
    "STORAGE_UNAVAILABLE",
    "File staging is unavailable. Your upload has not been saved. Please retry or contact the operator.",
  );
}

export function attachmentType(filename: string, mimeType: string): string {
  const type = types[extname(filename).toLowerCase()];
  if (
    !type ||
    filename.length > 180 ||
    filename !== filename.normalize("NFC") ||
    /[\/\\\x00-\x1f\x7f]/.test(filename) ||
    /^[. ]|[. ]$/.test(filename) ||
    /\.(exe|bat|cmd|sh|ps1|msi|dll|com|js|mjs|html|htm|svg|scr|php|py|jar)(\.|$)/i.test(
      filename,
    )
  )
    throw invalid(
      "Choose a document, text, image or ZIP file with a safe filename.",
    );
  if (
    mimeType !== type &&
    mimeType !== "application/octet-stream" &&
    !(type === "text/markdown" && mimeType === "text/plain") &&
    !(type === "text/csv" && mimeType === "application/vnd.ms-excel")
  )
    throw invalid("The file type does not match its filename.");
  return type;
}

async function verifySignature(file: Upload): Promise<void> {
  if (!file.size) throw invalid("Empty attachments are not supported.");
  const handle = await open(file.path, "r");
  const bytes = Buffer.alloc(Math.min(4096, file.size));
  try {
    await handle.read(bytes);
  } finally {
    await handle.close();
  }
  const type = file.mimeType;
  const valid = type.startsWith("text/")
    ? !bytes.includes(0) && !bytes.subarray(0, 2).equals(Buffer.from("MZ"))
    : type === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : type === "image/gif"
            ? /^GIF8[79]a/.test(bytes.subarray(0, 6).toString())
            : type === "image/webp"
              ? bytes.subarray(0, 4).toString() === "RIFF" &&
                bytes.subarray(8, 12).toString() === "WEBP"
              : bytes[0] === 80 &&
                bytes[1] === 75 &&
                [3, 5, 7].includes(bytes[2] ?? 0);
  if (!valid)
    throw invalid(
      "The attachment content does not match the selected file type.",
    );
}

async function stageFile(
  stream: Readable & { truncated?: boolean },
  path: string,
  filename: string,
  mimeType: string,
): Promise<Upload> {
  const hash = createHash("sha256");
  let size = 0;
  await pipeline(
    stream,
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    createWriteStream(path, { flags: "wx", mode: 0o600 }),
  );
  if (stream.truncated || size > readConfiguration().storage.maxBytes)
    throw invalid("An attachment exceeds the configured upload limit.", 413);
  const file = { path, filename, mimeType, size, sha256: hash.digest("hex") };
  await verifySignature(file);
  return file;
}

function multipartParser(
  headers: Headers,
  max: number,
  count: number,
): ReturnType<typeof busboy> {
  try {
    return busboy({
      headers: Object.fromEntries(headers),
      preservePath: true,
      defParamCharset: "utf8",
      // Busboy marks an exactly reached limit truncated; allow one byte to distinguish overflow.
      limits: {
        files: count,
        fields: 2,
        // Busboy emits partsLimit when the exact count is reached; fields/files validate extras.
        parts: count + 3,
        fileSize: max + 1,
        fieldSize: 16000,
      },
    });
  } catch {
    throw invalid("Send a valid multipart/form-data boundary.");
  }
}

async function parseMultipart(
  request: Request,
  directory: string,
  kind: "message" | "deliverable",
): Promise<{ fields: Record<string, string>; files: Upload[] }> {
  const max = readConfiguration().storage.maxBytes;
  const count = kind === "message" ? 5 : 1;
  const tasks: Promise<Upload>[] = [];
  const fields: Record<string, string> = {};
  const parser = multipartParser(request.headers, max, count);
  let failure: unknown;
  const fail = (error: unknown): void => {
    failure ??= error;
    parser.destroy(error instanceof Error ? error : invalid("Invalid upload."));
  };
  parser.on("file", (name, stream, info) => {
    try {
      if (name !== (kind === "message" ? "files" : "file"))
        throw invalid("Unexpected file field.");
      if (!info.filename) throw invalid("An attachment filename is required.");
      const type = attachmentType(info.filename, info.mimeType);
      const task = stageFile(
        stream,
        join(directory, String(tasks.length)),
        info.filename,
        type,
      );
      tasks.push(task);
      void task.catch(fail);
    } catch (error: unknown) {
      stream.resume();
      fail(error);
    }
  });
  parser.on("field", (name, value, info) => {
    if (
      ![
        kind === "message" ? "body" : "parentDeliverableId",
        "requestId",
      ].includes(name) ||
      fields[name] !== undefined ||
      info.valueTruncated
    )
      fail(invalid("Invalid upload fields."));
    else fields[name] = value;
  });
  for (const event of ["filesLimit", "fieldsLimit", "partsLimit"] as const)
    parser.on(event, () =>
      fail(invalid(`Send at most ${count} file${count === 1 ? "" : "s"}.`)),
    );
  let bytes = 0;
  const bound = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(
        bytes > max * count + 32768
          ? invalid("Upload is too large.", 413)
          : null,
        chunk,
      );
    },
  });
  try {
    if (!request.body) throw invalid("A message body is required.");
    // CAST: fetch supplies a Web byte stream; Node's stream typing uses its own declaration.
    await pipeline(
      Readable.fromWeb(
        request.body as import("node:stream/web").ReadableStream<Uint8Array>,
      ),
      bound,
      parser,
      {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)]),
      },
    );
  } catch (error: unknown) {
    failure ??= error;
  }
  const outcomes = await Promise.allSettled(tasks);
  if (storageFailure(failure)) throw unavailable();
  if (failure)
    throw failure instanceof AppError
      ? failure
      : invalid("Upload interrupted or malformed. Please retry.");
  const files = outcomes.map((outcome) => {
    if (outcome.status === "rejected") throw outcome.reason;
    return outcome.value;
  });
  return { fields, files };
}

export async function readMessageUpload(
  request: Request,
): Promise<MessageUpload> {
  const upload = await readUpload(request, "message");
  try {
    const parsed = z
      .object({
        requestId: z.uuid(),
        body: z.string().trim().max(4000).default(""),
      })
      .strict()
      .parse(upload.fields);
    if (!parsed.body && !upload.files.length)
      throw invalid("Write a message or choose an attachment.");
    return { ...parsed, files: upload.files, cleanup: upload.cleanup };
  } catch (error: unknown) {
    await upload.cleanup();
    throw error;
  }
}

export async function readDeliverableUpload(
  request: Request,
): Promise<DeliverableUpload> {
  const upload = await readUpload(request, "deliverable");
  try {
    const parsed = z
      .object({
        requestId: z.uuid(),
        parentDeliverableId: z.uuid().optional(),
      })
      .strict()
      .parse(upload.fields);
    if (upload.files.length !== 1)
      throw invalid("Choose one deliverable file.");
    return {
      requestId: parsed.requestId,
      parentDeliverableId: parsed.parentDeliverableId ?? null,
      files: upload.files,
      cleanup: upload.cleanup,
    };
  } catch (error: unknown) {
    await upload.cleanup();
    throw error;
  }
}

async function readUpload(
  request: Request,
  kind: "message" | "deliverable",
): Promise<{
  fields: Record<string, string>;
  files: Upload[];
  cleanup: () => Promise<void>;
}> {
  const config = readConfiguration();
  if (
    request.headers.get("origin") !== config.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AppError(403, "FORBIDDEN", "Request origin is not allowed.");
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    throw new AppError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Send a multipart/form-data upload.",
    );
  const staging = join(config.storage.path, ".staging");
  let directory: string;
  try {
    await mkdir(staging, { recursive: true, mode: 0o700 });
    directory = await mkdtemp(join(staging, `${kind}-`));
  } catch {
    throw unavailable();
  }
  const cleanup = (): Promise<void> =>
    rm(directory, { recursive: true, force: true });
  try {
    return { ...(await parseMultipart(request, directory, kind)), cleanup };
  } catch (error: unknown) {
    await cleanup();
    throw error;
  }
}
