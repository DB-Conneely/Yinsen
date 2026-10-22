import { randomUUID } from "node:crypto";
import { checkDatabase } from "../../../lib/db/health";
import { AppError, DatabaseError } from "../../../lib/errors";
import { logFailure } from "../../../lib/logger";
import { readReleaseIdentity } from "../../../lib/release";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const correlationId = randomUUID();
  const headers = {
    "Cache-Control": "no-store",
    "X-Request-Id": correlationId,
  };
  try {
    await checkDatabase();
    const release = readReleaseIdentity();
    return Response.json(
      {
        data: { status: "healthy", version: release.version, release },
        meta: null,
        error: null,
      },
      { headers },
    );
  } catch (error: unknown) {
    const safe = error instanceof AppError ? error : new DatabaseError();
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
