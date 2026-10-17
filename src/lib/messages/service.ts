import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { readConfiguration } from "../config";
import type { ProjectActor } from "../projects/access";
import { projectMemberIds, projectActivity } from "../projects/service";
import { publishProject, publishConversation } from "../events/hub";
import {
  putFile,
  getFile,
  removeFailedFiles,
  type StoredFile,
} from "../storage/adapter";
import type { MessageUpload } from "../storage/upload";
import { conversationAccess, type Conversation } from "./access";
import { messageRows, type MessagePage } from "./queries";
import { resourceId } from "../projects/validation";
import { logger } from "../logger";
import type postgres from "postgres";
import type { ProposalTerms } from "./proposal-validators";

async function publish(conversation: Conversation): Promise<void> {
  if (conversation.kind === "project")
    publishProject(
      conversation.id,
      await projectMemberIds(getSql(), conversation.id),
    );
  else publishConversation(conversation.id);
}

function messageFingerprint(upload: MessageUpload): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        body: upload.body,
        files: upload.files.map(({ filename, size, sha256, mimeType }) => ({
          filename,
          size,
          sha256,
          mimeType,
        })),
      }),
    )
    .digest("hex");
}

async function persistAttachments(
  sql: postgres.TransactionSql,
  upload: MessageUpload,
  created: StoredFile[],
): Promise<void> {
  for (const staged of upload.files) {
    const id = randomUUID();
    const file = {
      key: `messages/${upload.requestId}/${id}`,
      driver: readConfiguration().storage.driver,
      size: staged.size,
      mimeType: staged.mimeType,
    };
    created.push(file);
    await putFile(file, staged.path);
    await sql`insert into message_attachments(id,message_id,filename,storage_key,driver,size,mime_type,sha256) values (${id},${upload.requestId},${staged.filename},${file.key},${file.driver},${staged.size},${staged.mimeType},${staged.sha256})`;
  }
}

async function persistMessage(
  sql: postgres.TransactionSql,
  conversation: Conversation,
  upload: MessageUpload,
  actor: ProjectActor,
  created: StoredFile[],
): Promise<void> {
  const inserted = await writeMessage(sql, conversation, actor, {
    id: upload.requestId,
    body: upload.body,
    fingerprint: messageFingerprint(upload),
    type: "message",
    chainId: null,
    replyTo: null,
    proposalData: null,
  });
  if (inserted) await persistAttachments(sql, upload, created);
}

export type MessageRecord = {
  id: string;
  body: string;
  fingerprint: string;
  type: "message" | "proposal" | "counter" | "accept" | "reject";
  chainId: string | null;
  replyTo: string | null;
  proposalData: ProposalTerms | null;
};

export async function writeMessage(
  sql: postgres.TransactionSql,
  conversation: Conversation,
  actor: ProjectActor,
  record: MessageRecord,
): Promise<boolean> {
  const existing =
    await sql`select id,sender_id,sender_type,fingerprint,client_id,project_id from messages where id=${resourceId.parse(record.id)}`;
  const row = existing[0];
  if (row) {
    if (
      row.sender_id !== actor.id ||
      row.sender_type !== actor.role ||
      row.fingerprint !== record.fingerprint ||
      (conversation.kind === "client" ? row.client_id : row.project_id) !==
        conversation.id
    )
      throw new AppError(
        409,
        "MESSAGE_CONFLICT",
        "This send has changed. Start a new message.",
      );
    return false;
  }
  await sql`insert into messages(id,client_id,project_id,sender_type,sender_id,body,fingerprint,type,chain_id,reply_to,proposal_data,created_at) values (${record.id},${conversation.kind === "client" ? conversation.id : null},${conversation.kind === "project" ? conversation.id : null},${actor.role},${actor.id},${record.body},${record.fingerprint},${record.type},${record.chainId},${record.replyTo},${record.proposalData ? JSON.stringify(record.proposalData) : null}::text::jsonb,clock_timestamp())`;
  if (conversation.kind === "project")
    await projectActivity(sql, conversation.id, actor, "message.sent");
  else
    await sql`insert into activity_events(client_id,actor_type,actor_id,event_type) values (${conversation.id},${actor.role},${actor.id},${record.type === "message" ? "message.sent" : `proposal.${record.type}`})`;
  return true;
}

export async function sendMessage(
  conversation: Conversation,
  upload: MessageUpload,
  actor: ProjectActor,
): Promise<MessagePage> {
  const created: StoredFile[] = [];
  let committed = false;
  let callbackFailed = false;
  try {
    const result = await getSql().begin(async (sql) => {
      try {
        await conversationAccess(conversation, actor, sql, "update");
        await persistMessage(sql, conversation, upload, actor, created);
        return await messageRows(sql, conversation, actor);
      } catch (error: unknown) {
        callbackFailed = true;
        throw error;
      }
    });
    committed = true;
    // Retrying a lost COMMIT response must also repair its missed live invalidation.
    await publish(conversation);
    return result;
  } finally {
    // Only a failed callback proves COMMIT was never requested. A lost COMMIT reply retains bytes.
    if (!committed && callbackFailed) await removeFailedFiles(created);
    else if (!committed && created.length)
      logger.error(
        {
          event: "storage.commit_uncertain",
          keys: created.map((file) => file.key),
        },
        "Message commit uncertain; private files retained for safe retry or operator recovery",
      );
    await upload.cleanup();
  }
}

export async function markMessagesRead(
  conversation: Conversation,
  input: unknown,
  actor: ProjectActor,
): Promise<{ read: number }> {
  const ids = z
    .object({ ids: z.array(resourceId).max(50) })
    .strict()
    .parse(input).ids;
  const count = await getSql().begin(async (sql) => {
    await conversationAccess(conversation, actor, sql);
    if (!ids.length) return 0;
    const rows =
      await sql`insert into message_reads(message_id,actor_id,actor_type) select m.id,${actor.id},${actor.role} from messages m where m.id in ${sql(ids)} and m.sender_id<>${actor.id} and (${conversation.kind === "client"} and m.client_id=${conversation.id} or ${conversation.kind === "project"} and m.project_id=${conversation.id}) on conflict do nothing returning message_id`;
    return rows.length;
  });
  if (count) await publish(conversation);
  return { read: count };
}

export async function downloadAttachment(
  messageId: string,
  attachmentId: string,
  actor: ProjectActor,
): Promise<Response> {
  return getSql().begin(async (sql) => {
    const rows = await sql<
      (StoredFile & {
        filename: string;
        clientId: string | null;
        projectId: string | null;
      })[]
    >`select a.storage_key as key,a.driver,a.size::float8 as size,a.mime_type as "mimeType",a.filename,m.client_id as "clientId",m.project_id as "projectId" from message_attachments a join messages m on m.id=a.message_id where a.id=${resourceId.parse(attachmentId)} and m.id=${resourceId.parse(messageId)}`;
    const file = rows[0];
    if (!file) throw new AppError(404, "NOT_FOUND", "Attachment not found.");
    await conversationAccess(
      file.projectId
        ? { kind: "project", id: file.projectId }
        : { kind: "client", id: file.clientId ?? "" },
      actor,
      sql,
    ).catch((error: unknown) => {
      if (error instanceof AppError && error.statusCode === 404)
        throw new AppError(404, "NOT_FOUND", "Attachment not found.");
      throw error;
    });
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
