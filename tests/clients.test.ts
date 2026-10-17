import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { z } from "zod";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getSql } from "../src/lib/db/client";
import { getBranding } from "../src/lib/settings";
import { completeSetup, isSetupComplete } from "../src/lib/setup/service";
import { loginOperator } from "../src/lib/auth/login";
import {
  archiveClient,
  clientActivity,
  getClient,
  listClients,
  saveClient,
} from "../src/lib/clients/service";
import {
  destroyClientSession,
  issueMagicLink,
  listClientSessions,
  redeemMagicLink,
  requestMagicLink,
  revokeClientSession,
  validateClientSession,
} from "../src/lib/auth/client";
import { tokenDigest } from "../src/lib/auth/session";
import { consumeClientAttempt } from "../src/lib/auth/rate-limit";
import { cleanExpiredAccess, startAccessCleanup } from "../src/lib/cleanup";
import { verifyEmail, sendMagicLink } from "../src/lib/email/resend";
import { readConfiguration } from "../src/lib/config";
import { GET as list, POST as create } from "../src/app/api/clients/route";
import {
  GET as detail,
  PATCH as update,
  DELETE as remove,
} from "../src/app/api/clients/[id]/route";
import {
  GET as inspect,
  POST as action,
} from "../src/app/api/clients/[id]/[action]/route";
import { GET as me } from "../src/app/api/auth/me/route";
import { POST as logout } from "../src/app/api/auth/logout/route";

const account = {
  name: "Remote Operator",
  email: "operator@example.test",
  password: "remote-proof-password-12!",
  brandName: "Remote Studio",
  brandColour: "#315e9e",
  defaultCurrency: "EUR",
  welcomeText: "A private place for our work together.",
};
let operator: Awaited<ReturnType<typeof loginOperator>>;
const origin = process.env.APP_ORIGIN ?? "http://localhost:3009";
function request(
  path: string,
  token?: string,
  body?: unknown,
  method = "POST",
): Request {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      ...(token ? { cookie: `pylon_session=${token}` } : {}),
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
}
function newInput(): {
  name: string;
  email: string;
  metadata: Record<string, string>;
} {
  return {
    name: `Client ${randomUUID()}`,
    email: `${randomUUID()}@example.test`,
    metadata: { sector: "Design" },
  };
}
async function newClient(): Promise<Awaited<ReturnType<typeof saveClient>>> {
  return saveClient(newInput(), operator.user);
}
function configureEmail(): void {
  vi.stubEnv("RESEND_API_KEY", "re_fixture_only");
  vi.stubEnv("EMAIL_FROM_ADDRESS", "portal@example.test");
}
beforeAll(async () => {
  if (!(await isSetupComplete())) await completeSetup(account);
  operator = await loginOperator({
    email: account.email,
    password: account.password,
  });
  await getBranding();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  if (globalThis.yinsenCleanupTimer) {
    clearInterval(globalThis.yinsenCleanupTimer);
    globalThis.yinsenCleanupTimer = undefined;
  }
});
afterAll(async () => {
  await getSql().end();
});

describe("client management through real writers and route callers", () => {
  it("preserves omitted PATCH fields, including an empty and metadata-only update", async () => {
    const client = await saveClient(
      { ...newInput(), company: "Preserved", phone: "01234", notes: "Private" },
      operator.user,
    );
    const context = { params: Promise.resolve({ id: client.id }) };
    for (const body of [{ name: "Renamed" }, {}, { metadata: { code: "B" } }]) {
      expect(
        (await update(request("/", operator.session.token, body), context))
          .status,
      ).toBe(200);
      expect(await getClient(client.id)).toMatchObject({
        name: "Renamed",
        email: client.email,
        company: "Preserved",
        phone: "01234",
        notes: "Private",
        metadata: "metadata" in body ? body.metadata : client.metadata,
      });
    }
    await saveClient(
      { company: "", phone: "", notes: "", metadata: {} },
      operator.user,
      client.id,
    );
    expect(await getClient(client.id)).toMatchObject({
      company: "",
      phone: "",
      notes: "",
      metadata: {},
    });
  });
  it("normalizes uniqueness including archived clients; restores the original identity", async () => {
    const input = newInput();
    const client = await saveClient(
      {
        ...input,
        email: ` ${input.email.toUpperCase()} `,
        company: "Example",
        phone: "01234",
        notes: "Private",
      },
      operator.user,
    );
    expect(client).toMatchObject({
      email: input.email,
      metadata: input.metadata,
      company: "Example",
      notes: "Private",
    });
    await expect(
      saveClient({ ...input, name: "Duplicate" }, operator.user),
    ).rejects.toMatchObject({ statusCode: 409 });
    await archiveClient(client.id, operator.user, false);
    await expect(saveClient(input, operator.user)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(
      saveClient({ name: "Changed" }, operator.user, client.id),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(
      (await archiveClient(client.id, operator.user, true)).deletedAt,
    ).toBeNull();
    const updated = await saveClient(
      { name: "Updated", metadata: { code: "A" } },
      operator.user,
      client.id,
    );
    expect(updated).toMatchObject({
      id: client.id,
      name: "Updated",
      email: input.email,
      metadata: { code: "A" },
    });
    expect(
      (await clientActivity(client.id)).map((entry) => entry.eventType),
    ).toEqual(
      expect.arrayContaining([
        "client.created",
        "client.updated",
        "client.archived",
        "client.restored",
      ]),
    );
    await expect(
      saveClient({ ...input, metadata: { x: 3 } }, operator.user),
    ).rejects.toThrow();
    await expect(getClient(randomUUID())).rejects.toMatchObject({
      statusCode: 404,
    });
    const exact = await listClients({ search: input.email });
    expect(exact.total).toBe(1);
    expect((await listClients({ search: "%_\\" })).total).toBe(0);
  });
  it("paginates searched real records deterministically", async () => {
    const prefix = randomUUID();
    for (let index = 0; index < 11; index++)
      await saveClient(
        {
          name: `${prefix} ${String(index).padStart(2, "0")}`,
          email: `${prefix}-${index}@example.test`,
        },
        operator.user,
      );
    const first = await listClients({ search: prefix });
    const second = await listClients({
      search: prefix,
      page: 2,
      sort: "newest",
    });
    expect(first).toMatchObject({ total: 11, pages: 2, page: 1 });
    expect(first.clients).toHaveLength(10);
    expect(second.clients).toHaveLength(1);
    await expect(listClients({ page: 0 })).rejects.toThrow();
  });
  it("authorizes all installed client handlers and preserves failed-write facts", async () => {
    const input = newInput();
    const before = (await getSql()`select id from clients`).length;
    expect(
      (
        await create(
          request("/api/clients", operator.session.token, {
            ...input,
            forged: true,
          }),
        )
      ).status,
    ).toBe(400);
    expect((await getSql()`select id from clients`).length).toBe(before);
    const created = await create(
      request("/api/clients", operator.session.token, input),
    );
    expect(created.status).toBe(200);
    const parsed: unknown = await created.json();
    const id = z.object({ data: z.object({ id: z.uuid() }) }).parse(parsed)
      .data.id;
    const context = { params: Promise.resolve({ id }) };
    expect(
      (
        await detail(
          request("/", operator.session.token, undefined, "GET"),
          context,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await list(
          request("/api/clients", operator.session.token, undefined, "GET"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await update(
          request("/", operator.session.token, { phone: "5678" }),
          context,
        )
      ).status,
    ).toBe(200);
    for (const name of ["activity", "sessions"])
      expect(
        (
          await inspect(
            request("/", operator.session.token, undefined, "GET"),
            { params: Promise.resolve({ id, action: name }) },
          )
        ).status,
      ).toBe(200);
    expect(
      (
        await action(request("/", operator.session.token), {
          params: Promise.resolve({ id, action: "generate-link" }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await remove(request("/", operator.session.token), context)).status,
    ).toBe(200);
    expect(
      (
        await action(request("/", operator.session.token), {
          params: Promise.resolve({ id, action: "restore" }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await action(request("/", operator.session.token), {
          params: Promise.resolve({ id, action: "unknown" }),
        })
      ).status,
    ).toBe(404);
    const link = await issueMagicLink(id, operator.user);
    const session = await redeemMagicLink({ token: link.token });
    expect((await me(request("/", session.token))).status).toBe(200);
    expect(
      (await me(request("/", session.token))).headers.get("set-cookie"),
    ).toBeNull();
    for (const token of [undefined, session.token]) {
      expect((await create(request("/", token, input))).status).toBe(401);
      expect(
        (await detail(request("/", token, undefined, "GET"), context)).status,
      ).toBe(401);
      expect(
        (await update(request("/", token, { name: "Forged" }), context)).status,
      ).toBe(401);
      expect((await remove(request("/", token), context)).status).toBe(401);
      expect(
        (
          await action(request("/", token), {
            params: Promise.resolve({ id, action: "restore" }),
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await inspect(request("/", token, undefined, "GET"), {
            params: Promise.resolve({ id, action: "activity" }),
          })
        ).status,
      ).toBe(401);
    }
    expect((await logout(request("/", session.token))).status).toBe(200);
    expect(await validateClientSession(session.token)).toBeNull();
  });
});

describe("client token and session invariants after actual Drizzle initialization", () => {
  it("stores hashes, enforces single use under competing redemption and fixed session lifetime", async () => {
    const client = await newClient();
    const link = await issueMagicLink(client.id, operator.user);
    const stored =
      await getSql()`select token_hash, extract(epoch from expires_at-created_at)/3600 as hours from magic_link_tokens where client_id=${client.id}`;
    expect(stored[0]?.token_hash).toBe(tokenDigest(link.token));
    expect(Number(stored[0]?.hours)).toBeCloseTo(24, 2);
    const results = await Promise.allSettled([
      redeemMagicLink({ token: link.token }),
      redeemMagicLink({ token: link.token }),
    ]);
    expect(
      results.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    const session = results.find((entry) => entry.status === "fulfilled");
    if (session?.status !== "fulfilled")
      throw new TypeError("Expected redeemed session");
    const before = await listClientSessions(client.id);
    expect(before).toHaveLength(1);
    expect(await validateClientSession(session.value.token)).toMatchObject({
      id: client.id,
      role: "client",
    });
    expect(await listClientSessions(client.id)).toEqual(before);
    await expect(redeemMagicLink({ token: link.token })).rejects.toMatchObject({
      statusCode: 401,
    });
    await getSql()`update client_sessions set expires_at=now()-interval '1 second' where client_id=${client.id}`;
    expect(await validateClientSession(session.value.token)).toBeNull();
    await destroyClientSession(session.value.token);
    expect(await validateClientSession(undefined)).toBeNull();
    expect(await validateClientSession("malformed")).toBeNull();
  });
  it("expires tokens, revokes sessions and pending links immediately and never revives them on restore", async () => {
    const client = await newClient();
    const expired = await issueMagicLink(client.id, operator.user);
    await getSql()`update magic_link_tokens set expires_at=now()-interval '1 second' where token_hash=${tokenDigest(expired.token)}`;
    await expect(
      redeemMagicLink({ token: expired.token }),
    ).rejects.toMatchObject({ statusCode: 401 });
    const link = await issueMagicLink(client.id, operator.user);
    const session = await redeemMagicLink({ token: link.token });
    const pending = await issueMagicLink(client.id, operator.user);
    const sessions = await listClientSessions(client.id);
    const active = sessions[0];
    if (!active) throw new TypeError("Missing session");
    expect(
      (
        await action(
          request("/", operator.session.token, { sessionId: active.id }),
          { params: Promise.resolve({ id: client.id, action: "sessions" }) },
        )
      ).status,
    ).toBe(200);
    expect(await validateClientSession(session.token)).toBeNull();
    await expect(
      revokeClientSession(client.id, active.id, operator.user),
    ).rejects.toMatchObject({ statusCode: 404 });
    const next = await redeemMagicLink({ token: pending.token });
    const old = await issueMagicLink(client.id, operator.user);
    await archiveClient(client.id, operator.user, false);
    expect(await validateClientSession(next.token)).toBeNull();
    await archiveClient(client.id, operator.user, true);
    expect(await validateClientSession(next.token)).toBeNull();
    await expect(redeemMagicLink({ token: old.token })).rejects.toMatchObject({
      statusCode: 401,
    });
    expect((await listClientSessions(client.id)).length).toBe(0);
  });
  it("invalidates pending credentials only when the normalized email changes", async () => {
    const client = await newClient();
    const retained = await issueMagicLink(
      client.id,
      operator.user,
      client.email,
    );
    await saveClient(
      { email: ` ${client.email.toUpperCase()} `, name: "Renamed" },
      operator.user,
      client.id,
    );
    await expect(
      redeemMagicLink({ token: retained.token }),
    ).resolves.toHaveProperty("token");
    const old = await issueMagicLink(client.id, operator.user, client.email);
    const changedEmail = `${randomUUID()}@example.test`;
    await saveClient({ email: changedEmail }, operator.user, client.id);
    await saveClient(
      { name: "New address holder", email: client.email },
      operator.user,
    );
    await expect(redeemMagicLink({ token: old.token })).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      issueMagicLink(client.id, operator.user, client.email),
    ).rejects.toMatchObject({ statusCode: 404 });
    const fresh = await issueMagicLink(client.id, operator.user, changedEmail);
    const session = await redeemMagicLink({ token: fresh.token });
    expect(await validateClientSession(session.token)).toMatchObject({
      id: client.id,
      email: changedEmail,
    });
  });
  it("serializes email edits with credential issuance and redemption", async () => {
    const client = await newClient();
    const old = await issueMagicLink(client.id, operator.user, client.email);
    const changedEmail = `${randomUUID()}@example.test`;
    const result = await Promise.allSettled([
      issueMagicLink(client.id, operator.user, client.email),
      saveClient({ email: changedEmail }, operator.user, client.id),
      redeemMagicLink({ token: old.token }),
    ]);
    expect(result[1]?.status).toBe("fulfilled");
    const issued = result[0];
    if (issued?.status === "fulfilled")
      await expect(
        redeemMagicLink({ token: issued.value.token }),
      ).rejects.toMatchObject({ statusCode: 401 });
    expect(
      (
        await getSql()`select token_hash from magic_link_tokens where client_id=${client.id}`
      ).length,
    ).toBe(0);
  });
  it("limits requests by normalized email and independent transport buckets", () => {
    for (let index = 0; index < 3; index++)
      consumeClientAttempt("peer-a", "limited@example.test", 100);
    expect(() =>
      consumeClientAttempt("peer-b", "limited@example.test", 100),
    ).toThrow("Too many requests");
    for (let index = 0; index < 10; index++)
      consumeClientAttempt("peer-ip", `email-${index}@example.test`, 100);
    expect(() =>
      consumeClientAttempt("peer-ip", "another@example.test", 100),
    ).toThrow();
    for (let index = 0; index < 30; index++)
      consumeClientAttempt("verify-peer", undefined, 100);
    expect(() => consumeClientAttempt("verify-peer", undefined, 100)).toThrow();
    expect(() =>
      consumeClientAttempt("peer-a", "limited@example.test", 900100),
    ).not.toThrow();
  });
});

describe("native Resend boundary with actual owned caller/database", () => {
  it("rejects partial configuration; distinguishes absent and verified service without secrets", async () => {
    expect(await verifyEmail()).toBe("skipped");
    await expect(
      requestMagicLink({ email: "absent@example.test" }),
    ).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      sendMagicLink({
        to: "a@example.test",
        name: "A",
        url: origin,
        brandName: "Brand",
        brandColour: "#2457a7",
        key: "key",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    vi.stubEnv("RESEND_API_KEY", "re_fixture");
    expect(() => readConfiguration()).toThrow("together");
    configureEmail();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ id: randomUUID() }))),
    );
    expect(await verifyEmail()).toBe("accepted");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({ message: "invalid key" }, { status: 403 }),
        ),
      ),
    );
    expect(await verifyEmail()).toBe("failed");
  });
  it("produces escaped branded 15-minute links and the current generic response; failures invalidate pending tokens", async () => {
    configureEmail();
    const client = await newClient();
    const sent: { url: string; options: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options: RequestInit) => {
        sent.push({ url, options });
        return Promise.resolve(Response.json({ id: randomUUID() }));
      }),
    );
    let started = performance.now();
    const known = await requestMagicLink({
      email: ` ${client.email.toUpperCase()} `,
    });
    expect(performance.now() - started).toBeGreaterThanOrEqual(10900);
    started = performance.now();
    const unknown = await requestMagicLink({
      email: `${randomUUID()}@example.test`,
    });
    expect(performance.now() - started).toBeGreaterThanOrEqual(10900);
    expect(known).toEqual(unknown);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://api.resend.com/emails");
    const rawBody = sent[0]?.options.body;
    if (typeof rawBody !== "string")
      throw new TypeError("Expected native JSON body");
    const body = JSON.parse(rawBody) as unknown;
    expect(body).toMatchObject({
      from: "portal@example.test",
      to: [client.email],
      subject: "Sign in to Remote Studio",
    });
    const tokens =
      await getSql()`select token_hash,extract(epoch from expires_at-created_at)/60 as minutes from magic_link_tokens where client_id=${client.id}`;
    expect(tokens).toHaveLength(1);
    expect(Number(tokens[0]?.minutes)).toBeCloseTo(15, 1);
    await sendMagicLink({
      to: client.email,
      name: "<script>&'",
      url: `${origin}/portal/verify#abc`,
      brandName: '<b>"Brand"',
      brandColour: "#2457a7",
      key: "escape-check",
    });
    expect(sent[1]?.options.body).toContain("&lt;script&gt;&amp;&#39;");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { name: "rate_limit_exceeded", message: "private-provider-error" },
            { status: 429 },
          ),
        ),
      ),
    );
    started = performance.now();
    expect(await requestMagicLink({ email: client.email })).toEqual(known);
    expect(performance.now() - started).toBeGreaterThanOrEqual(10900);
    expect(
      (
        await getSql()`select token_hash from magic_link_tokens where client_id=${client.id}`
      ).length,
    ).toBe(1);
    expect(
      (await clientActivity(client.id)).map((entry) => entry.eventType),
    ).toContain("client.email_failed");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.reject(new DOMException("Timed out", "TimeoutError")),
      ),
    );
    expect(await verifyEmail()).toBe("failed");
    await expect(
      sendMagicLink({
        to: client.email,
        name: "A",
        url: origin,
        brandName: "B",
        brandColour: "#2457a7",
        key: "timeout",
      }),
    ).rejects.toMatchObject({ code: "EMAIL_UNAVAILABLE" });
  }, 45000);
  it("preserves an accepted email's token if only accepted-activity bookkeeping fails", async () => {
    configureEmail();
    const client = await newClient();
    let token: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options: RequestInit) => {
        const body = z
          .object({ text: z.string() })
          .parse(JSON.parse(String(options.body)) as unknown);
        token = body.text.match(/\/portal\/verify#([a-f0-9]{64})/)?.[1];
        return Promise.resolve(Response.json({ id: randomUUID() }));
      }),
    );
    const admin = postgres(process.env.MIGRATION_DATABASE_URL ?? "", {
      max: 1,
    });
    try {
      await admin`create function patch13_fail_accepted() returns trigger language plpgsql as $$ begin if NEW.event_type = 'client.email_accepted' then raise exception 'selective accepted activity failure'; end if; return NEW; end $$`;
      await admin`create trigger patch13_accepted_failure before insert on activity_events for each row execute function patch13_fail_accepted()`;
      await requestMagicLink({ email: client.email });
      const session = await redeemMagicLink({ token });
      expect(await validateClientSession(session.token)).toMatchObject({
        id: client.id,
      });
      expect(
        (await clientActivity(client.id)).map((entry) => entry.eventType),
      ).not.toContain("client.email_failed");
    } finally {
      await admin`drop trigger if exists patch13_accepted_failure on activity_events`;
      await admin`drop function if exists patch13_fail_accepted()`;
      await admin.end();
    }
  }, 20000);
  it("generates readable email actions for extreme and default brand colours", async () => {
    configureEmail();
    const html: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options: RequestInit) => {
        html.push(
          z
            .object({ html: z.string() })
            .parse(JSON.parse(String(options.body)) as unknown).html,
        );
        return Promise.resolve(Response.json({ id: randomUUID() }));
      }),
    );
    for (const brandColour of ["#ffffff", "#000000", "#ffff00", "#315e9e"])
      await sendMagicLink({
        to: "colour@example.test",
        name: "Client",
        url: origin,
        brandName: "Brand",
        brandColour,
        key: randomUUID(),
      });
    for (const [index, foreground] of [
      "#000000",
      "#ffffff",
      "#000000",
      "#ffffff",
    ].entries())
      expect(html[index]).toContain(`color:${foreground}`);
  });
});

describe("actual startup/hourly cleanup registration and real database failures", () => {
  it("runs on registration and each hourly tick, survives failure and recovers", async () => {
    const client = await newClient();
    const link = await issueMagicLink(client.id, operator.user);
    await redeemMagicLink({ token: link.token });
    async function expire(): Promise<void> {
      await getSql()`update magic_link_tokens set expires_at=now()-interval '1 second' where client_id=${client.id}`;
      await getSql()`update client_sessions set expires_at=now()-interval '1 second' where client_id=${client.id}`;
    }
    await expire();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await startAccessCleanup();
    expect((await listClientSessions(client.id)).length).toBe(0);
    expect(
      (
        await getSql()`select token_hash from magic_link_tokens where client_id=${client.id}`
      ).length,
    ).toBe(0);
    const later = await issueMagicLink(client.id, operator.user);
    await redeemMagicLink({ token: later.token });
    await expire();
    await startAccessCleanup();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await cleanExpiredAccess();
    expect(
      (
        await getSql()`select id from client_sessions where client_id=${client.id}`
      ).length,
    ).toBe(0);
    const admin = postgres(process.env.MIGRATION_DATABASE_URL ?? "", {
      max: 1,
    });
    try {
      await admin`revoke delete on client_sessions from yinsen_runtime`;
      await expect(cleanExpiredAccess()).resolves.toBeUndefined();
    } finally {
      await admin`grant delete on client_sessions to yinsen_runtime`;
      await admin.end();
    }
    await expect(cleanExpiredAccess()).resolves.toBeUndefined();
  });
});
