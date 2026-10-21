import nextEnv from "@next/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import postgres from "postgres";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { getSql } from "../src/lib/db/client";
import { hashPassword, comparePassword } from "../src/lib/auth/password";
import {
  passwordSchema,
  emailSchema,
  setupSchema,
  passwordStrength,
} from "../src/lib/auth/validation";
import {
  createOperatorSession,
  validateOperatorSession,
  requireOperatorToken,
  destroyOperatorSession,
  sessionCookie,
  tokenDigest,
  requestToken,
} from "../src/lib/auth/session";
import { consumeLoginAttempt } from "../src/lib/auth/rate-limit";
import { completeSetup, isSetupComplete } from "../src/lib/setup/service";
import { loginOperator } from "../src/lib/auth/login";
import { getBranding } from "../src/lib/settings";
import { assertWriteRequest, apiResponse, readJson } from "../src/lib/http";
import { BrandFrame } from "../src/components/brand";
import Home from "../src/app/page";
import ClientLogin from "../src/app/portal/login/page";
import Setup from "../src/app/setup/page";
import OperatorGuide from "../src/app/operator-guide/page";
import {
  GET as setupStatus,
  POST as setupPost,
} from "../src/app/api/setup/route";
import { GET as me } from "../src/app/api/auth/me/route";
import { POST as logout } from "../src/app/api/auth/logout/route";

nextEnv.loadEnvConfig(process.cwd());
const account = {
  name: "Remote Operator",
  email: "operator@example.test",
  password: "remote-proof-password-12!",
  brandName: "Remote Studio",
  brandColour: "#315e9e",
  defaultCurrency: "EUR",
  welcomeText: "A private place for our work together.",
};
const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
function request(path: string, body: unknown, token?: string): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(token ? { cookie: `pylon_session=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async (): Promise<void> => {
  if (process.env.TEST_ISOLATED_DATABASE !== "1")
    throw new TypeError(
      "Access tests require TEST_ISOLATED_DATABASE=1 and a deliberate synthetic database.",
    );
  if (!(await isSetupComplete())) await completeSetup(account);
});
afterAll(async (): Promise<void> => {
  await getSql().end();
});

describe("password and input trust boundaries", () => {
  it("normalizes emails and never silently truncates bcrypt input", async () => {
    expect(emailSchema.parse("  Operator@Example.Test ")).toBe(account.email);
    expect(passwordSchema.safeParse("😀".repeat(19)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
    const digest = await hashPassword("long unique password");
    expect(digest).toMatch(/^\$2[aby]\$12\$/);
    expect(await comparePassword("long unique password", digest)).toBe(true);
    expect(await comparePassword("another password", digest)).toBe(false);
    expect(await comparePassword("a".repeat(73), digest)).toBe(false);
    expect(passwordStrength("short")).toContain("8");
    expect(passwordStrength("adequate12")).toContain("Longer");
    expect(passwordStrength("a unique long passphrase")).toContain("Strong");
    expect(
      setupSchema.safeParse({ ...account, unexpected: "secret" }).success,
    ).toBe(false);
  });
  it("limits five attempts without extending the window and expires the bucket", () => {
    for (let i = 0; i < 5; i++) consumeLoginAttempt("synthetic-peer", 100);
    expect(() => consumeLoginAttempt("synthetic-peer", 101)).toThrow(
      "Too many attempts",
    );
    expect(() => consumeLoginAttempt("synthetic-peer", 900100)).not.toThrow();
  });
  it("requires exact configured origin and JSON, regardless of Host", async () => {
    expect(() =>
      assertWriteRequest(
        new Headers({ origin, "content-type": "application/json" }),
      ),
    ).not.toThrow();
    expect(() =>
      assertWriteRequest(
        new Headers({
          origin: "https://attacker.test",
          host: new URL(origin).host,
          "content-type": "application/json",
        }),
      ),
    ).toThrow("origin");
    expect(() =>
      assertWriteRequest(new Headers({ "content-type": "application/json" })),
    ).toThrow("origin");
    expect(() =>
      assertWriteRequest(new Headers({ origin, "content-type": "text/plain" })),
    ).toThrow("application/json");
    expect(await readJson(request("/api/setup", { name: "test" }))).toEqual({
      name: "test",
    });
    await expect(
      readJson(request("/api/setup", "x".repeat(8192))),
    ).rejects.toMatchObject({ statusCode: 413 });
    const failed = await apiResponse(() =>
      Promise.reject(new TypeError("private secret")),
    );
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private secret");
  });
});

describe("real persisted operator access", () => {
  it("keeps exactly one operator and rejects repeated and concurrent setup", async () => {
    expect(await isSetupComplete()).toBe(true);
    const results = await Promise.allSettled([
      completeSetup(account),
      completeSetup(account),
    ]);
    expect(
      results.every(
        (result) =>
          result.status === "rejected" && result.reason instanceof Error,
      ),
    ).toBe(true);
    expect((await getSql()`select id from operator`).length).toBe(1);
    expect((await getSql()`select singleton from settings`).length).toBe(1);
    expect((await setupStatus()).status).toBe(409);
    expect((await setupPost(request("/api/setup", account))).status).toBe(409);
    await expect(Setup()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
  it("returns generic failures and no password or session in user JSON", async () => {
    await expect(
      loginOperator({ email: account.email, password: "wrong password" }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid email or password.",
    });
    await expect(
      loginOperator({
        email: "absent@example.test",
        password: "wrong password",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid email or password.",
    });
    const result = await loginOperator({
      email: " OPERATOR@example.test ",
      password: account.password,
    });
    expect(result.user).toMatchObject({
      name: account.name,
      role: "operator",
      email: account.email,
    });
    expect(result.user).not.toHaveProperty("password_hash");
    await destroyOperatorSession(result.session.token);
  });
  it("stores only digests, slides live expiry and rejects expiry/revocation", async () => {
    // Exercise the installed ordering: startup/branding initializes Drizzle first.
    await getBranding();
    const rows = await getSql()<{ id: string }[]>`select id from operator`;
    const id = rows[0]?.id;
    if (!id) throw new TypeError("Missing synthetic operator");
    const session = await createOperatorSession(id);
    expect(session.token).toMatch(/^[a-f0-9]{64}$/);
    const hash = tokenDigest(session.token);
    expect(hash).not.toBe(session.token);
    const stored =
      await getSql()`select token_hash from operator_sessions where token_hash = ${hash}`;
    expect(stored).toHaveLength(1);
    await getSql()`update operator_sessions set expires_at = now() + interval '1 day' where token_hash = ${hash}`;
    expect(await requireOperatorToken(session.token)).toMatchObject({
      id,
      role: "operator",
    });
    const slid = await getSql()<
      { days: number }[]
    >`select extract(epoch from expires_at - now()) / 86400 as days from operator_sessions where token_hash = ${hash}`;
    expect(Number(slid[0]?.days)).toBeGreaterThan(89);
    await getSql()`update operator_sessions set expires_at = now() - interval '1 second' where token_hash = ${hash}`;
    expect(await validateOperatorSession(session.token)).toBeNull();
    await destroyOperatorSession(session.token);
    expect(await validateOperatorSession(session.token)).toBeNull();
    await expect(requireOperatorToken(undefined)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(await validateOperatorSession("malformed")).toBeNull();
    expect(requestToken(request("/", {}, "abc"))).toBe("abc");
    expect(sessionCookie("abc")).toContain("HttpOnly; SameSite=Lax");
    expect(sessionCookie("", 0)).toContain("Max-Age=0");
  });
  it("protects actual me/logout adapters and revokes the session", async () => {
    const result = await loginOperator({
      email: account.email,
      password: account.password,
    });
    const authenticated = request("/api/auth/me", {}, result.session.token);
    const response = await me(authenticated);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toContain("pylon_session=");
    expect(
      (await logout(request("/api/auth/logout", {}, result.session.token)))
        .status,
    ).toBe(200);
    expect((await me(authenticated)).status).toBe(401);
    expect((await logout(request("/api/auth/logout", {}))).status).toBe(401);
  });
  it("preserves page authorization and withholds renewal on a real proxy database failure", async () => {
    const result = await loginOperator({
      email: account.email,
      password: account.password,
    });
    const token = result.session.token;
    const input = new NextRequest(`${origin}/dashboard`, {
      headers: { cookie: `pylon_session=${token}` },
    });
    const admin = postgres(process.env.MIGRATION_DATABASE_URL ?? "", {
      max: 1,
    });
    try {
      expect((await proxy(input)).headers.get("set-cookie")).toContain(token);
      await admin`revoke update on operator_sessions from yinsen_runtime`;
      const response = await proxy(input);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("set-cookie")).toBeNull();
      await expect(requireOperatorToken(token)).rejects.toBeDefined();
      expect((await me(request("/api/auth/me", {}, token))).status).toBe(503);
    } finally {
      await admin`grant update on operator_sessions to yinsen_runtime`;
      await admin.end();
      await destroyOperatorSession(token);
    }
  });
  it("uses persisted branding on landing and client shell without exposing private settings", async () => {
    const branding = await getBranding();
    if (!branding) throw new TypeError("Missing synthetic branding");
    expect(branding).toMatchObject({
      brandName: account.brandName,
      brandColour: account.brandColour,
      defaultCurrency: account.defaultCurrency,
    });
    const landing = renderToStaticMarkup(await Home());
    expect(landing).toContain(account.welcomeText);
    expect(landing).toContain(account.brandColour);
    expect(renderToStaticMarkup(await ClientLogin())).toContain(
      `Contact ${account.brandName}`,
    );
    expect(
      renderToStaticMarkup(BrandFrame({ branding, children: "body" })),
    ).toContain("EUR");
    expect(renderToStaticMarkup(await OperatorGuide())).toContain(
      "server environment",
    );
  });
});
