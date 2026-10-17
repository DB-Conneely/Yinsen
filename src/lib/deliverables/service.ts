import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { readConfiguration } from "../config";
import { logger } from "../logger";
import {
  lockProject,
  operatorOnly,
  type ProjectActor,
} from "../projects/access";
import { resourceId } from "../projects/validation";
import { projectActivity, projectMemberIds } from "../projects/service";
import { publishProject } from "../events/hub";
import {
  putFile,
  getFile,
  removeFailedFiles,
  type StoredFile,
} from "../storage/adapter";
import type { DeliverableUpload, Upload } from "../storage/upload";
import {
  listDeliverables,
  milestoneProject,
  type Deliverable,
} from "./queries";
import { releaseInput } from "./validation";

async function publish(projectId: string): Promise<void> {
  publishProject(projectId, await projectMemberIds(getSql(), projectId));
}

function fingerprint(upload: DeliverableUpload, file: Upload): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        parent: upload.parentDeliverableId,
        filename: file.filename,
        size: file.size,
        sha256: file.sha256,
        mimeType: file.mimeType,
      }),
    )
    .digest("hex");
}

async function lineage(
  sql: postgres.TransactionSql,
  milestoneId: string,
  parentId: string | null,
): Promise<{ parent: string | null; version: number }> {
  if (!parentId) return { parent: null, version: 1 };
  const rows = await sql<
    { id: string; parent: string | null }[]
  >`select id,parent_deliverable_id as parent from deliverables where id=${resourceId.parse(parentId)} and milestone_id=${milestoneId}`;
  const row = rows[0];
  if (!row)
    throw new AppError(
      404,
      "NOT_FOUND",
      "Parent deliverable not found in this milestone.",
    );
  const parent = row.parent ?? row.id;
  const versions = await sql<
    { version: number }[]
  >`select max(version)::int+1 as version from deliverables where id=${parent} or parent_deliverable_id=${parent}`;
  return { parent, version: versions[0]?.version ?? 2 };
}

async function persist(
  sql: postgres.TransactionSql,
  milestoneId: string,
  projectId: string,
  upload: DeliverableUpload,
  actor: ProjectActor,
  created: StoredFile[],
): Promise<void> {
  const file = upload.files[0];
  if (!file || upload.files.length !== 1)
    throw new AppError(400, "INVALID_UPLOAD", "Choose one deliverable file.");
  const id = resourceId.parse(upload.requestId);
  const hash = fingerprint(upload, file);
  const existing =
    await sql`select milestone_id,uploaded_by,fingerprint from deliverables where id=${id}`;
  if (existing[0]) {
    if (
      existing[0].milestone_id !== milestoneId ||
      existing[0].uploaded_by !== actor.id ||
      existing[0].fingerprint !== hash
    )
      throw new AppError(
        409,
        "UPLOAD_CONFLICT",
        "This upload has changed. Choose the file again to start a new upload.",
      );
    return;
  }
  const chain = await lineage(sql, milestoneId, upload.parentDeliverableId);
  const stored = {
    key: `deliverables/${id}/${randomUUID()}`,
    driver: readConfiguration().storage.driver,
    size: file.size,
    mimeType: file.mimeType,
  };
  created.push(stored);
  await putFile(stored, file.path);
  await sql`insert into deliverables(id,milestone_id,parent_deliverable_id,version,filename,storage_key,driver,size,mime_type,sha256,fingerprint,uploaded_by) values (${id},${milestoneId},${chain.parent},${chain.version},${file.filename},${stored.key},${stored.driver},${file.size},${file.mimeType},${file.sha256},${hash},${actor.id})`;
  await projectActivity(sql, projectId, actor, "deliverable.uploaded");
}

export async function uploadDeliverable(
  milestoneId: string,
  upload: DeliverableUpload,
  actor: ProjectActor,
): Promise<Deliverable> {
  operatorOnly(actor);
  const created: StoredFile[] = [];
  let callbackFailed = false;
  let committed = false;
  try {
    const projectId = await milestoneProject(milestoneId);
    const result = await getSql().begin(async (sql) => {
      try {
        await lockProject(sql, projectId, actor);
        if ((await milestoneProject(milestoneId, sql)) !== projectId)
          throw new AppError(404, "NOT_FOUND", "Milestone not found.");
        await persist(sql, milestoneId, projectId, upload, actor, created);
        const saved = (await listDeliverables(projectId, actor, sql)).find(
          (item) => item.id === upload.requestId,
        );
        if (!saved)
          throw new AppError(
            503,
            "UPLOAD_UNAVAILABLE",
            "Unable to save this upload. Please retry.",
          );
        return saved;
      } catch (error: unknown) {
        callbackFailed = true;
        throw error;
      }
    });
    committed = true;
    await publish(projectId);
    return result;
  } finally {
    // A lost COMMIT acknowledgement is not proof of rollback; same-ID retry recovers the saved row.
    if (!committed && callbackFailed) await removeFailedFiles(created);
    else if (!committed && created.length)
      logger.error(
        {
          event: "storage.commit_uncertain",
          keys: created.map((file) => file.key),
        },
        "Deliverable commit uncertain; private bytes retained for retry",
      );
    await upload.cleanup();
  }
}

async function fileProject(
  id: string,
): Promise<{ projectId: string; milestoneId: string }> {
  const rows = await getSql()<
    { projectId: string; milestoneId: string }[]
  >`select m.project_id as "projectId",m.id as "milestoneId" from deliverables d join milestones m on m.id=d.milestone_id where d.id=${resourceId.parse(id)}`;
  if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Deliverable not found.");
  return rows[0];
}

async function currentFile(
  sql: postgres.TransactionSql,
  projectId: string,
  id: string,
  actor: ProjectActor,
): Promise<Deliverable> {
  try {
    const current = (await listDeliverables(projectId, actor, sql)).find(
      (item) => item.id === id,
    );
    if (!current)
      throw new AppError(404, "NOT_FOUND", "Deliverable not found.");
    return current;
  } catch (error: unknown) {
    if (error instanceof AppError && error.statusCode === 404)
      throw new AppError(404, "NOT_FOUND", "Deliverable not found.");
    throw error;
  }
}

export async function releaseDeliverable(
  id: string,
  input: unknown,
  actor: ProjectActor,
): Promise<Deliverable> {
  operatorOnly(actor);
  const data = releaseInput.parse(input);
  const { projectId } = await fileProject(id);
  const result = await getSql().begin(async (sql) => {
    await lockProject(sql, projectId, actor);
    return writeDeliverableRelease(sql, projectId, id, data.released, actor);
  });
  await publish(projectId);
  return result;
}

// Caller holds the project lock; manual release and later settlement share this transition.
export async function writeDeliverableRelease(
  sql: postgres.TransactionSql,
  projectId: string,
  id: string,
  released: boolean,
  actor: ProjectActor,
): Promise<Deliverable> {
  const current = await currentFile(sql, projectId, id, actor);
  if (current.released !== released) {
    await sql`update deliverables set released=${released} where id=${id}`;
    await projectActivity(
      sql,
      projectId,
      actor,
      released ? "deliverable.released" : "deliverable.relocked",
    );
  }
  return { ...current, released };
}

export async function downloadDeliverable(
  id: string,
  actor: ProjectActor,
): Promise<Response> {
  const { projectId } = await fileProject(id);
  return getSql().begin(async (sql) => {
    // Membership edits/relock cannot race the authorization decision before opening private bytes.
    await sql`select id from projects where id=${projectId} for share`;
    const current = await currentFile(sql, projectId, id, actor);
    if (actor.role === "client" && !current.released)
      throw new AppError(
        402,
        "PAYMENT_REQUIRED",
        "This version is pending release by the operator.",
      );
    const rows = await sql<
      (StoredFile & { filename: string })[]
    >`select storage_key as key,driver,size::float8 as size,mime_type as "mimeType",filename from deliverables where id=${id}`;
    const file = rows[0];
    if (!file) throw new AppError(404, "NOT_FOUND", "Deliverable not found.");
    await projectActivity(sql, projectId, actor, "deliverable.downloaded");
    return new Response(await getFile(file), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="${file.filename.replace(/[^a-zA-Z0-9._ -]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });
}
