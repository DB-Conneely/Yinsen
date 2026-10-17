import "./fixture";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { z } from "zod";

const origin = process.env.TEST_ORIGIN ?? process.env.APP_ORIGIN;
assert.ok(origin, "Select the guarded installed fixture origin.");
const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
async function write(
  path: string,
  body: unknown,
  cookie = "",
  method = "POST",
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      origin: origin ?? "",
      "content-type": "application/json",
      cookie,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
async function data<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  assert.equal(response.status, 200);
  return z.object({ data: schema }).parse(await response.json()).data;
}
function cookieOf(response: Response): string {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}
async function me(cookie: string, path = "/api/auth/me"): Promise<Response> {
  return fetch(`${origin}${path}`, { headers: { cookie } });
}
const clientSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  company: z.string(),
  phone: z.string(),
  notes: z.string(),
  metadata: z.record(z.string(), z.string()),
});
try {
  const login = await write("/api/auth/login", {
    email: "operator@example.test",
    password: "remote-proof-password-12!",
  });
  assert.equal(login.status, 200);
  const operator = cookieOf(login);
  const email = `${randomUUID()}@example.test`;
  const client = await data(
    await write(
      "/api/clients",
      {
        name: "HTTP Client",
        email: ` ${email.toUpperCase()} `,
        notes: "Operator-only",
        company: "HTTP Company",
        phone: "01234",
        metadata: { category: "Proof" },
      },
      operator,
    ),
    clientSchema,
  );
  assert.equal(client.email, email);
  assert.deepEqual(client.metadata, { category: "Proof" });
  for (const body of [
    { name: "HTTP Renamed" },
    {},
    { metadata: { category: "Updated" } },
  ]) {
    const edited = await data(
      await write(`/api/clients/${client.id}`, body, operator, "PATCH"),
      clientSchema,
    );
    assert.equal(edited.name, "HTTP Renamed");
    assert.equal(edited.company, "HTTP Company");
    assert.equal(edited.phone, "01234");
    assert.equal(edited.notes, "Operator-only");
    assert.deepEqual(
      edited.metadata,
      "metadata" in body ? body.metadata : client.metadata,
    );
    const persisted =
      await sql`select company, phone, notes from clients where id=${client.id}`;
    assert.deepEqual(persisted[0], {
      company: "HTTP Company",
      phone: "01234",
      notes: "Operator-only",
    });
  }
  const pendingIdentity = await data(
    await write(`/api/clients/${client.id}/generate-link`, {}, operator),
    z.object({ url: z.url() }),
  );
  const nextEmail = `${randomUUID()}@example.test`;
  await data(
    await write(
      `/api/clients/${client.id}`,
      { email: nextEmail },
      operator,
      "PATCH",
    ),
    clientSchema,
  );
  assert.equal(
    (
      await write("/api/auth/verify", {
        token: new URL(pendingIdentity.url).hash.slice(1),
      })
    ).status,
    401,
  );
  await data(
    await write(`/api/clients/${client.id}`, { email }, operator, "PATCH"),
    clientSchema,
  );
  assert.equal(
    (await write("/api/clients", { name: "Duplicate", email }, operator))
      .status,
    409,
  );
  const before = await sql`select id from clients`;
  assert.equal(
    (
      await write(
        "/api/clients",
        { name: "Invalid", email, forged: true },
        operator,
      )
    ).status,
    400,
  );
  assert.equal((await sql`select id from clients`).length, before.length);
  assert.equal(
    (
      await write("/api/clients", {}, operator, "POST", {
        origin: "https://attacker.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await write("/api/clients", {}, operator, "POST", {
        "content-type": "text/plain",
      })
    ).status,
    415,
  );
  assert.equal(
    (await write("/api/clients", { notes: "a".repeat(8192) }, operator)).status,
    413,
  );
  const link = await data(
    await write(`/api/clients/${client.id}/generate-link`, {}, operator),
    z.object({ url: z.url() }),
  );
  const token = new URL(link.url).hash.slice(1);
  const attempts = await Promise.all([
    write("/api/auth/verify", { token }),
    write("/api/auth/verify", { token }),
  ]);
  assert.deepEqual(
    attempts.map((response) => response.status).sort(),
    [200, 401],
  );
  const accepted = attempts.find((response) => response.status === 200);
  assert.ok(accepted);
  const cookie = cookieOf(accepted);
  assert.match(
    accepted.headers.get("set-cookie") ?? "",
    /HttpOnly; SameSite=Lax; Max-Age=7776000; Secure/,
  );
  const current = await data(
    await me(cookie),
    z.object({ id: z.uuid(), role: z.literal("client"), email: z.email() }),
  );
  assert.equal(current.id, client.id);
  const second = await data(
    await write(
      "/api/clients",
      {
        name: "Other Client",
        email: `${randomUUID()}@example.test`,
        notes: "Other private note",
      },
      operator,
    ),
    clientSchema,
  );
  assert.equal(
    (
      await data(
        await me(cookie, `/api/auth/me?clientId=${second.id}`),
        z.object({ id: z.uuid() }),
      )
    ).id,
    client.id,
  );
  for (const path of [
    `/api/clients/${second.id}`,
    `/api/clients/${randomUUID()}`,
    `/api/clients/${second.id}/sessions`,
    `/api/clients/${second.id}/activity`,
  ])
    assert.equal((await me(cookie, path)).status, 401);
  assert.equal(
    (await write(`/api/clients/${client.id}/restore`, {}, cookie)).status,
    401,
  );
  const fixed =
    await sql`select expires_at::text from client_sessions where client_id=${client.id}`;
  await me(cookie);
  assert.deepEqual(
    await sql`select expires_at::text from client_sessions where client_id=${client.id}`,
    fixed,
  );
  assert.equal((await me(cookie)).headers.get("set-cookie"), null);
  assert.equal(
    (
      await fetch(`${origin}/dashboard/clients/${second.id}`, {
        headers: { cookie },
        redirect: "manual",
      })
    ).status,
    307,
  );
  const expired = await data(
    await write(`/api/clients/${client.id}/generate-link`, {}, operator),
    z.object({ url: z.url() }),
  );
  const expiredToken = new URL(expired.url).hash.slice(1);
  await sql`update magic_link_tokens set expires_at=now()-interval '1 second' where token_hash=${digest(expiredToken)}`;
  assert.equal(
    (await write("/api/auth/verify", { token: expiredToken })).status,
    401,
  );
  const session = await data(
    await me(operator, `/api/clients/${client.id}/sessions`),
    z.array(z.object({ id: z.uuid() })),
  );
  assert.ok(session[0]);
  assert.equal(
    (
      await write(
        `/api/clients/${client.id}/sessions`,
        { sessionId: session[0].id },
        operator,
      )
    ).status,
    200,
  );
  assert.equal((await me(cookie)).status, 401);
  const pending = await data(
    await write(`/api/clients/${client.id}/generate-link`, {}, operator),
    z.object({ url: z.url() }),
  );
  assert.equal(
    (await write(`/api/clients/${client.id}`, {}, operator, "DELETE")).status,
    200,
  );
  assert.equal(
    (
      await write(
        "/api/clients",
        { name: "Duplicate archived", email: email.toUpperCase() },
        operator,
      )
    ).status,
    409,
  );
  assert.equal(
    (await write(`/api/clients/${client.id}/restore`, {}, operator)).status,
    200,
  );
  assert.equal(
    (
      await write("/api/auth/verify", {
        token: new URL(pending.url).hash.slice(1),
      })
    ).status,
    401,
  );
  assert.equal((await me(cookie)).status, 401);
  const competing = await data(
    await write(`/api/clients/${client.id}/generate-link`, {}, operator),
    z.object({ url: z.url() }),
  );
  const race = await Promise.all([
    write("/api/auth/verify", { token: new URL(competing.url).hash.slice(1) }),
    write(`/api/clients/${client.id}`, {}, operator, "DELETE"),
  ]);
  assert.equal(race[1]?.status, 200);
  const redeemed = race[0];
  assert.ok(redeemed);
  assert.ok([200, 401].includes(redeemed.status));
  if (redeemed.status === 200)
    assert.equal((await me(cookieOf(redeemed))).status, 401);
  assert.equal(
    (await sql`select id from client_sessions where client_id=${client.id}`)
      .length,
    0,
  );
  assert.equal(
    (
      await sql`select token_hash from magic_link_tokens where client_id=${client.id}`
    ).length,
    0,
  );
  for (let index = 0; index < 31; index++) {
    const result = await write(
      "/api/auth/verify",
      { token: "a".repeat(64) },
      "",
      "POST",
      {
        "x-forwarded-for": `192.0.2.${index}`,
        "x-real-ip": `192.0.2.${index}`,
      },
    );
    assert.ok([401, 429].includes(result.status));
    if (index === 30) assert.equal(result.status, 429);
  }
  process.stdout.write(
    `Installed clients passed: ${origin}; normalized/archive uniqueness, metadata, native redemption race/replay/expiry, fixed sessions, identity/role isolation, CSRF/limits/rollback, revoke/delete/restore and spoofed-forwarding throttle.\n`,
  );
} finally {
  await sql.end();
}
