import { createHash } from "node:crypto";
import type postgres from "postgres";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { publishConversation, publishProject } from "../events/hub";
import { writeProject } from "../projects/service";
import { writeMilestone } from "../milestones/service";
import type { ProjectActor } from "../projects/access";
import { conversationAccess, type Conversation } from "./access";
import { messageRows, type MessagePage } from "./queries";
import { writeMessage, type MessageRecord } from "./service";
import {
  proposalAction,
  proposalTerms,
  type ProposalAction,
} from "./proposal-validators";

type Target = {
  id: string;
  chainId: string;
  senderId: string;
  senderType: string;
  terms: string;
};

async function targetProposal(
  sql: postgres.TransactionSql,
  conversation: Conversation,
  action: ProposalAction,
): Promise<Target | undefined> {
  if (action.type === "proposal") return undefined;
  const rows = await sql<
    Target[]
  >`select id,chain_id as "chainId",sender_id as "senderId",sender_type as "senderType",proposal_data::text as terms from messages where id=${action.proposalId} and client_id=${conversation.id} and type in ('proposal','counter')`;
  if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Proposal not found.");
  return rows[0];
}

function recordFor(action: ProposalAction, target?: Target): MessageRecord {
  const terms = "terms" in action ? action.terms : null;
  return {
    id: action.requestId,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(action))
      .digest("hex"),
    type: action.type,
    chainId: target?.chainId ?? action.requestId,
    replyTo: target?.id ?? null,
    proposalData: terms,
    body: terms
      ? `${action.type === "proposal" ? "Proposed project" : "Counter-proposal"}: ${terms.name} — ${terms.budget} ${terms.currency} minor units`
      : action.type === "accept"
        ? "Proposal accepted. The agreed project is active."
        : "Proposal declined.",
  };
}

async function assertLatest(
  sql: postgres.TransactionSql,
  target: Target,
  actor: ProjectActor,
): Promise<void> {
  const rows =
    await sql`select id,type from messages where chain_id=${target.chainId} order by position desc limit 1`;
  if (rows[0]?.id !== target.id)
    throw new AppError(
      409,
      "PROPOSAL_CHANGED",
      "This proposal has changed. Review the latest terms before responding.",
    );
  if (target.senderId === actor.id || target.senderType === actor.role)
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the receiving party can respond to this proposal.",
    );
}

async function acceptedProject(
  sql: postgres.TransactionSql,
  targetId: string,
): Promise<string | null> {
  const rows = await sql<
    { id: string }[]
  >`select id from projects where proposal_message_id=${targetId}`;
  return rows[0]?.id ?? null;
}

async function persistAction(
  sql: postgres.TransactionSql,
  conversation: Conversation,
  action: ProposalAction,
  actor: ProjectActor,
): Promise<string | null> {
  const target = await targetProposal(sql, conversation, action);
  const record = recordFor(action, target);
  const existing =
    await sql`select id from messages where id=${action.requestId}`;
  if (existing.length) {
    await writeMessage(sql, conversation, actor, record);
    return action.type === "accept" && target
      ? acceptedProject(sql, target.id)
      : null;
  }
  if (target) await assertLatest(sql, target, actor);
  let projectId: string | null = null;
  if (action.type === "accept" && target) {
    const terms = proposalTerms.parse(JSON.parse(target.terms) as unknown);
    const { milestones, ...fields } = terms;
    projectId = await writeProject(
      sql,
      { ...fields, clientIds: [conversation.id] },
      actor,
      undefined,
      { messageId: target.id, snapshot: terms },
    );
    for (const milestone of milestones)
      await writeMilestone(sql, projectId, milestone, actor);
  }
  await writeMessage(sql, conversation, actor, record);
  return projectId;
}

export async function actOnProposal(
  conversation: Conversation,
  input: unknown,
  actor: ProjectActor,
): Promise<MessagePage> {
  const action = proposalAction.parse(input);
  if (conversation.kind !== "client")
    throw new AppError(
      400,
      "GENERAL_CONVERSATION_REQUIRED",
      "Send proposals in your general client conversation.",
    );
  const result = await getSql().begin(async (sql) => {
    await conversationAccess(conversation, actor, sql, "update");
    const projectId = await persistAction(sql, conversation, action, actor);
    return { projectId, page: await messageRows(sql, conversation, actor) };
  });
  // A confirmed retry also repairs notification loss after an uncertain COMMIT response.
  publishConversation(conversation.id);
  if (result.projectId) publishProject(result.projectId, [conversation.id]);
  return result.page;
}
