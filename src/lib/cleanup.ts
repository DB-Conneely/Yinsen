import { getSql } from "./db/client";
import { logger } from "./logger";

let inFlight: Promise<void> | undefined;
declare global {
  var yinsenCleanupTimer: ReturnType<typeof setInterval> | undefined;
}

async function runCleanup(): Promise<void> {
  try {
    const removed = await getSql().begin(async (sql) => {
      const operator =
        await sql`delete from operator_sessions where expires_at <= now() returning token_hash`;
      const client =
        await sql`delete from client_sessions where expires_at <= now() returning id`;
      const tokens =
        await sql`delete from magic_link_tokens where expires_at <= now() returning token_hash`;
      return {
        operator: operator.length,
        client: client.length,
        tokens: tokens.length,
      };
    });
    logger.info(
      { event: "cleanup.completed", ...removed },
      "Expired access removed",
    );
  } catch {
    logger.warn(
      { event: "cleanup.failed" },
      "Access cleanup failed; the next hourly run will retry",
    );
  }
}

export function cleanExpiredAccess(): Promise<void> {
  inFlight ??= runCleanup().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

export async function startAccessCleanup(): Promise<void> {
  if (globalThis.yinsenCleanupTimer) return;
  await cleanExpiredAccess();
  globalThis.yinsenCleanupTimer = setInterval(
    () => {
      void cleanExpiredAccess();
    },
    60 * 60 * 1000,
  );
  globalThis.yinsenCleanupTimer.unref();
}
