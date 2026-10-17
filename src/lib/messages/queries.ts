import { z } from "zod";
import type postgres from "postgres";
import { getSql } from "../db/client";
import type { ProjectActor } from "../projects/access";
import { conversationAccess, type Conversation } from "./access";

export type Attachment = {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  sha256: string;
};
export type Message = {
  id: string;
  position: string;
  body: string;
  senderId: string;
  senderType: "operator" | "client";
  senderName: string;
  createdAt: string;
  read: boolean;
  attachments: Attachment[];
};
export type MessagePage = { messages: Message[]; hasEarlier: boolean };
const filters = z
  .object({
    before: z
      .string()
      .regex(/^[1-9][0-9]{0,18}$/)
      .refine(
        (value) => value.length < 19 || value <= "9223372036854775807",
        "Message cursor is outside the supported range.",
      )
      .optional(),
    since: z.iso.datetime({ offset: true }).optional(),
    search: z.string().trim().max(100).default(""),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  })
  .strict();

export async function messageRows(
  sql: postgres.Sql | postgres.TransactionSql,
  conversation: Conversation,
  actor: ProjectActor,
  input: unknown = {},
): Promise<MessagePage> {
  const filter = filters.parse(input);
  const rows = await sql<
    Message[]
  >`select m.id,m.position::text,m.body,m.sender_id as "senderId",m.sender_type as "senderType",case when m.sender_type='operator' then (select name from operator where id=m.sender_id) else (select name from clients where id=m.sender_id) end as "senderName",m.created_at::text as "createdAt",(m.sender_id=${actor.id} or exists(select 1 from message_reads r where r.message_id=m.id and r.actor_id=${actor.id} and r.actor_type=${actor.role})) as read from messages m where (${conversation.kind === "client"} and m.client_id=${conversation.id} or ${conversation.kind === "project"} and m.project_id=${conversation.id}) and (${filter.before ?? null}::bigint is null or m.position<${filter.before ?? null}::bigint) and (${filter.since ?? null}::timestamptz is null or m.created_at>${filter.since ?? null}::timestamptz) and (strpos(lower(m.body),lower(${filter.search}))>0) order by m.position desc limit ${filter.limit + 1}`;
  const hasEarlier = rows.length > filter.limit;
  const page = rows.slice(0, filter.limit).reverse();
  if (!page.length) return { messages: [], hasEarlier };
  const attachments = await sql<
    (Attachment & { messageId: string })[]
  >`select id,message_id as "messageId",filename,size::float8 as size,mime_type as "mimeType",sha256 from message_attachments where message_id in ${sql(page.map((row) => row.id))} order by id`;
  return {
    messages: page.map((row) => ({
      ...row,
      attachments: attachments
        .filter((file) => file.messageId === row.id)
        .map(({ messageId: _messageId, ...file }) => file),
    })),
    hasEarlier,
  };
}

export async function listMessages(
  conversation: Conversation,
  actor: ProjectActor,
  input: unknown = {},
): Promise<MessagePage> {
  return getSql().begin(async (sql) => {
    await conversationAccess(conversation, actor, sql);
    return messageRows(sql, conversation, actor, input);
  });
}

export type ConversationSummary = {
  kind: "client" | "project";
  id: string;
  name: string;
  unread: number;
  lastBody: string;
  lastAt: string | null;
};

export async function messageSummary(
  actor: ProjectActor,
): Promise<{ total: number; conversations: ConversationSummary[] }> {
  const conversations = await getSql()<
    ConversationSummary[]
  >`with conversations as (select 'client'::text as kind,c.id,c.name from clients c where c.deleted_at is null and (${actor.role === "operator"} or c.id=${actor.id}) union all select 'project',p.id,p.name from projects p where p.deleted_at is null and (${actor.role === "operator"} or exists(select 1 from project_clients pc join clients c on c.id=pc.client_id where pc.project_id=p.id and c.id=${actor.id} and c.deleted_at is null))) select c.kind,c.id,c.name,(select count(*)::int from messages m where (c.kind='client' and m.client_id=c.id or c.kind='project' and m.project_id=c.id) and m.sender_id<>${actor.id} and not exists(select 1 from message_reads r where r.message_id=m.id and r.actor_id=${actor.id} and r.actor_type=${actor.role})) as unread,coalesce((select body from messages m where (c.kind='client' and m.client_id=c.id or c.kind='project' and m.project_id=c.id) order by position desc limit 1),'') as "lastBody",(select created_at::text from messages m where (c.kind='client' and m.client_id=c.id or c.kind='project' and m.project_id=c.id) order by position desc limit 1) as "lastAt" from conversations c order by "lastAt" desc nulls last,c.name,c.id`;
  return {
    total: conversations.reduce(
      (sum, conversation) => sum + conversation.unread,
      0,
    ),
    conversations,
  };
}
