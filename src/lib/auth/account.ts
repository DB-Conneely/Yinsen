import { z } from "zod";
import type postgres from "postgres";
import { getSql } from "../db/client";
import { AppError } from "../errors";
import { emailSchema, passwordSchema } from "./validation";
import { comparePassword, hashPassword } from "./password";
import { requireOperatorToken, tokenDigest } from "./session";
import { consumeLoginAttempt } from "./rate-limit";

type LockedAccount = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
};

async function withAccountLock<T>(
  token: string | undefined,
  action: (sql: postgres.TransactionSql, account: LockedAccount) => Promise<T>,
): Promise<T> {
  const actor = await requireOperatorToken(token);
  const result = await getSql().begin(async (sql) => {
    const rows = await sql<
      LockedAccount[]
    >`select id,name,email,password_hash as "passwordHash" from operator where id=${actor.id} for update`;
    const account = rows[0];
    const live =
      await sql`select 1 from operator_sessions where operator_id=${actor.id} and token_hash=${tokenDigest(token ?? "")} and expires_at>now()`;
    if (!account || !live.length)
      throw new AppError(401, "UNAUTHORIZED", "Please log in to continue.");
    return { value: await action(sql, account) };
  });
  return result.value;
}

async function checkPassword(
  password: string,
  account: LockedAccount,
): Promise<void> {
  consumeLoginAttempt(`account:${account.id}`);
  if (!(await comparePassword(password, account.passwordHash)))
    throw new AppError(
      400,
      "INVALID_PASSWORD",
      "Current password is incorrect.",
    );
}

export async function saveAccount(
  input: unknown,
  token: string | undefined,
): Promise<{ saved: true }> {
  const data = z
    .object({
      name: z.string().trim().min(1).max(100),
      email: emailSchema,
      currentPassword: passwordSchema,
    })
    .strict()
    .parse(input);
  return withAccountLock(token, async (sql, account) => {
    await checkPassword(data.currentPassword, account);
    await sql`update operator set name=${data.name},email=${data.email} where id=${account.id}`;
    return { saved: true };
  });
}

export async function changePassword(
  input: unknown,
  token: string | undefined,
): Promise<{ saved: true }> {
  const data = z
    .object({
      currentPassword: passwordSchema,
      newPassword: passwordSchema,
      confirmPassword: passwordSchema,
    })
    .strict()
    .refine(
      (value) => value.newPassword === value.confirmPassword,
      "New passwords must match.",
    )
    .parse(input);
  return withAccountLock(token, async (sql, account) => {
    await checkPassword(data.currentPassword, account);
    const hash = await hashPassword(data.newPassword);
    await sql`update operator set password_hash=${hash},auth_generation=auth_generation+1 where id=${account.id}`;
    await sql`delete from operator_sessions where operator_id=${account.id}`;
    return { saved: true };
  });
}

export type AccountSession = {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};
export async function listOperatorSessions(
  token: string | undefined,
): Promise<AccountSession[]> {
  const actor = await requireOperatorToken(token);
  return getSql()<
    AccountSession[]
  >`select id,created_at::text as "createdAt",expires_at::text as "expiresAt",token_hash=${tokenDigest(token ?? "")} as current from operator_sessions where operator_id=${actor.id} and expires_at>now() order by created_at desc,id`;
}

export async function revokeOperatorSessions(
  input: unknown,
  token: string | undefined,
): Promise<{ revoked: true }> {
  const data = z
    .discriminatedUnion("scope", [
      z.object({ scope: z.literal("one"), id: z.uuid() }).strict(),
      z
        .object({ scope: z.literal("all"), currentPassword: passwordSchema })
        .strict(),
    ])
    .parse(input);
  return withAccountLock(token, async (sql, account) => {
    if (data.scope === "all") {
      await checkPassword(data.currentPassword, account);
      // Also defeats a login that verified credentials before this revocation acquired the lock.
      await sql`update operator set auth_generation=auth_generation+1 where id=${account.id}`;
      await sql`delete from operator_sessions where operator_id=${account.id}`;
    } else {
      const rows =
        await sql`delete from operator_sessions where operator_id=${account.id} and id=${data.id} returning id`;
      if (!rows.length)
        throw new AppError(404, "NOT_FOUND", "Session not found.");
    }
    return { revoked: true };
  });
}
