import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "./db/client";
import { putFile, getFile, type StoredFile } from "./storage/adapter";
import type { readLogoUpload } from "./storage/upload";
import { readConfiguration } from "./config";
import { AppError } from "./errors";
import { operatorOnly, type ProjectActor } from "./projects/access";
import { logger } from "./logger";

export async function saveLogo(
  upload: Awaited<ReturnType<typeof readLogoUpload>>,
  actor: ProjectActor,
): Promise<{ saved: true }> {
  operatorOnly(actor);
  const id = upload.requestId;
  const file: StoredFile = {
    key: `branding/${id}/${randomUUID()}`,
    driver: readConfiguration().storage.driver,
    size: upload.file.size,
    mimeType: upload.file.mimeType,
  };
  await getSql()
    .begin(async (sql) => {
      await sql`select singleton from settings for update`;
      const existing = await sql<
        { sha256: string }[]
      >`select sha256 from branding_assets where id=${id}`;
      if (existing[0]) {
        if (existing[0].sha256 !== upload.file.sha256)
          throw new AppError(
            409,
            "UPLOAD_CHANGED",
            "Choose the original logo or select a new file.",
          );
        return;
      }
      await putFile(file, upload.file.path);
      // Retain bytes on uncertain COMMIT; never destroy an asset a committed invoice may reference.
      await sql`insert into branding_assets(id,key,driver,size,mime_type,sha256) values(${id},${file.key},${file.driver},${file.size},${file.mimeType},${upload.file.sha256})`;
      await sql`update settings set logo_id=${id}`;
    })
    .catch((error: unknown) => {
      logger.warn(
        { event: "branding.logo_save_failed", key: file.key },
        "Logo save failed; any stored bytes are retained for recovery",
      );
      throw error;
    });
  return { saved: true };
}

export async function publicLogo(id: string): Promise<Response> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new AppError(404, "NOT_FOUND", "Logo not found.");
  const rows = await getSql()<
    (StoredFile & { sha256: string })[]
  >`select key,driver,size,mime_type as "mimeType",sha256 from branding_assets where id=${id}`;
  const file = rows[0];
  if (!file) throw new AppError(404, "NOT_FOUND", "Logo not found.");
  return new Response(await getFile(file), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${file.sha256}"`,
    },
  });
}
