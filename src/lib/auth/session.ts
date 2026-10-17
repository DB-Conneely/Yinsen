import { createHash, randomBytes } from "node:crypto";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import type postgres from "postgres";

export const SESSION_COOKIE = "pylon_session";
export const SESSION_SECONDS = 90 * 24 * 60 * 60;
export type OperatorIdentity = {
  id: string;
  name: string;
  email: string;
  role: "operator";
};
export type Session = { token: string; expiresAt: Date };

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createOperatorSession(
  operatorId: string,
  sql: postgres.Sql | postgres.TransactionSql = getSql(),
): Promise<Session> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  // Drizzle installs identity timestamp serializers on the shared postgres client.
  await sql`insert into operator_sessions (token_hash, operator_id, expires_at) values (${tokenDigest(token)}, ${operatorId}, ${expiresAt.toISOString()})`;
  return { token, expiresAt };
}

export async function validateOperatorSession(
  token: string | undefined,
): Promise<OperatorIdentity | null> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  // Updating only a currently live row cannot revive an expired or revoked session.
  const rows = await getSql()<{ id: string; name: string; email: string }[]>`
    update operator_sessions s set expires_at = now() + interval '90 days'
    from operator o where s.operator_id = o.id and s.token_hash = ${tokenDigest(token)}
    and s.expires_at > now() returning o.id, o.name, o.email`;
  const identity = rows[0];
  return identity ? { ...identity, role: "operator" } : null;
}

export async function requireOperatorToken(
  token: string | undefined,
): Promise<OperatorIdentity> {
  const identity = await validateOperatorSession(token);
  if (!identity)
    throw new AppError(401, "UNAUTHORIZED", "Please log in to continue.");
  return identity;
}

export async function destroyOperatorSession(token: string): Promise<void> {
  await getSql()`delete from operator_sessions where token_hash = ${tokenDigest(token)}`;
}

export function sessionCookie(token: string, maxAge = SESSION_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function requestToken(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}
