import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { getBranding } from "../settings";
import { readConfiguration } from "../config";
import {
  getClient,
  lockClient,
  recordActivity,
  clientId,
} from "../clients/service";
import { tokenDigest, SESSION_SECONDS, type Session } from "./session";
import { emailSchema } from "./validation";
import { sendMagicLink } from "../email/resend";
import { logger } from "../logger";

export type ClientIdentity = {
  id: string;
  name: string;
  email: string;
  role: "client";
};

export async function validateClientSession(
  token: string | undefined,
): Promise<ClientIdentity | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await getSql()<
    { id: string; name: string; email: string }[]
  >`select c.id,c.name,c.email from client_sessions s join clients c on c.id=s.client_id where s.token_hash=${tokenDigest(token)} and s.expires_at>now() and c.deleted_at is null`;
  return rows[0] ? { ...rows[0], role: "client" } : null;
}

export async function issueMagicLink(
  id: string,
  actor: { id: string; role: "operator" | "client" },
  email: string | false = false,
): Promise<{ url: string; token: string; name: string }> {
  return getSql().begin(async (sql) => {
    await lockClient(sql, id);
    const client = await getClient(id, sql);
    if (client.deletedAt || (email && client.email !== email))
      throw new AppError(404, "NOT_FOUND", "Client not found.");
    const token = randomBytes(32).toString("hex");
    const expires = new Date(
      Date.now() + (email ? 15 * 60 : 24 * 60 * 60) * 1000,
    ).toISOString();
    await sql`insert into magic_link_tokens (token_hash,client_id,expires_at) values (${tokenDigest(token)},${id},${expires})`;
    await recordActivity(
      sql,
      id,
      actor,
      email ? "client.email_requested" : "client.link_created",
    );
    return {
      token,
      name: client.name,
      url: `${readConfiguration().origin}/portal/verify#${token}`,
    };
  });
}

export async function redeemMagicLink(input: unknown): Promise<Session> {
  const { token } = z
    .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(input);
  return getSql().begin(async (sql) => {
    const candidate = await sql<
      { client_id: string }[]
    >`select client_id from magic_link_tokens where token_hash=${tokenDigest(token)}`;
    const id = candidate[0]?.client_id;
    if (!id)
      throw new AppError(
        401,
        "INVALID_LINK",
        "This link is invalid or expired. Request a new link.",
      );
    await lockClient(sql, id);
    const consumed =
      await sql`update magic_link_tokens t set used_at=now() from clients c where t.client_id=c.id and c.deleted_at is null and t.token_hash=${tokenDigest(token)} and t.expires_at>now() and t.used_at is null returning t.client_id`;
    if (!consumed.length)
      throw new AppError(
        401,
        "INVALID_LINK",
        "This link is invalid or expired. Request a new link.",
      );
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    await sql`insert into client_sessions (token_hash,client_id,expires_at) values (${tokenDigest(sessionToken)},${id},${expiresAt.toISOString()})`;
    await recordActivity(sql, id, { id, role: "client" }, "client.logged_in");
    return { token: sessionToken, expiresAt };
  });
}

export async function requestMagicLink(
  input: unknown,
): Promise<{ message: string }> {
  const { email } = z.object({ email: emailSchema }).strict().parse(input);
  if (!readConfiguration().email)
    throw new AppError(
      503,
      "EMAIL_UNAVAILABLE",
      "Contact the operator for a login link.",
    );
  // Covers the provider's ten-second abort for unknown addresses and early failures too.
  const responseDeadline = delay(11000);
  try {
    const rows = await getSql()<
      { id: string }[]
    >`select id from clients where email=${email} and deleted_at is null`;
    const client = rows[0];
    if (client) await deliverClientLink(client, email);
    return {
      message:
        "If this email belongs to an active client, a login link has been requested. Check your inbox or contact the operator.",
    };
  } finally {
    await responseDeadline;
  }
}

async function deliverClientLink(
  client: { id: string },
  email: string,
): Promise<void> {
  const actor = { id: client.id, role: "client" as const };
  let link: Awaited<ReturnType<typeof issueMagicLink>>;
  try {
    link = await issueMagicLink(client.id, actor, email);
  } catch (error: unknown) {
    // An edit/archive can win the client lock after the public email lookup.
    if (error instanceof AppError && error.statusCode === 404) return;
    throw error;
  }
  try {
    const branding = await getBranding();
    if (!branding)
      throw new AppError(503, "EMAIL_UNAVAILABLE", "Portal setup is required.");
    await sendMagicLink({
      to: email,
      name: link.name,
      url: link.url,
      brandName: branding.brandName,
      brandColour: branding.brandColour,
      key: `magic-link/${tokenDigest(link.token)}`,
    });
  } catch {
    await getSql()`delete from magic_link_tokens where token_hash=${tokenDigest(link.token)}`;
    await recordActivity(getSql(), client.id, actor, "client.email_failed");
    logger.warn(
      { event: "email.magic_link_failed" },
      "Login email failed; manual login links remain available",
    );
    return;
  }
  await recordEmailAcceptance(client.id);
}

async function recordEmailAcceptance(id: string): Promise<void> {
  try {
    await recordActivity(
      getSql(),
      id,
      { id, role: "client" },
      "client.email_accepted",
    );
  } catch {
    logger.warn(
      { event: "email.accepted_activity_failed" },
      "Login email accepted; its activity record could not be saved",
    );
  }
}

export async function listClientSessions(
  id: string,
): Promise<{ id: string; createdAt: string; expiresAt: string }[]> {
  await getClient(id);
  return getSql()`select id,created_at::text as "createdAt",expires_at::text as "expiresAt" from client_sessions where client_id=${id} and expires_at>now() order by created_at desc`;
}

export async function revokeClientSession(
  id: string,
  sessionId: string,
  actor: { id: string; role: "operator" },
): Promise<void> {
  await getSql().begin(async (sql) => {
    await lockClient(sql, id);
    const deleted =
      await sql`delete from client_sessions where client_id=${id} and id=${clientId.parse(sessionId)} returning id`;
    if (!deleted.length)
      throw new AppError(404, "NOT_FOUND", "Session not found.");
    await recordActivity(sql, id, actor, "client.session_revoked");
  });
}

export async function destroyClientSession(token: string): Promise<void> {
  await getSql()`delete from client_sessions where token_hash=${tokenDigest(token)}`;
}
