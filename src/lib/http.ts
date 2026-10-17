import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { AppError, DatabaseError } from "./errors";
import { readConfiguration } from "./config";
import { logFailure } from "./logger";

export function assertWriteRequest(headers: Headers): void {
  if (
    headers.get("origin") !== readConfiguration().origin ||
    headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new AppError(403, "FORBIDDEN", "Request origin is not allowed.");
  }
  if (
    headers.get("content-type")?.split(";")[0]?.trim() !== "application/json"
  ) {
    throw new AppError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Send an application/json request.",
    );
  }
}

export async function readJson(
  request: Request,
  maxBytes = 8192,
): Promise<unknown> {
  assertWriteRequest(request.headers);
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "A JSON request body is required.",
    );
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > maxBytes)
        throw new AppError(
          413,
          "PAYLOAD_TOO_LARGE",
          "Request body is too large.",
        );
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "VALIDATION_ERROR", "Send valid JSON.");
  } finally {
    reader.releaseLock();
  }
}

export async function apiResponse(
  action: () => Promise<unknown>,
): Promise<Response> {
  const correlationId = randomUUID();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-Id": correlationId,
  };
  try {
    return Response.json(
      { data: await action(), meta: null, error: null },
      { headers },
    );
  } catch (error: unknown) {
    const safe =
      error instanceof AppError
        ? error
        : error instanceof ZodError
          ? new AppError(
              400,
              "VALIDATION_ERROR",
              error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(" "),
            )
          : new DatabaseError();
    logFailure(safe.code, correlationId);
    return Response.json(
      {
        data: null,
        meta: null,
        error: { code: safe.code, message: safe.message },
      },
      { status: safe.statusCode, headers },
    );
  }
}
