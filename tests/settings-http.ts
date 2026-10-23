import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertIsolatedTestEnvironment } from "./fixture";
import { z } from "zod";
import { defaultAppearance } from "../src/lib/appearance";

assertIsolatedTestEnvironment(process.env);
const origin = process.env.TEST_ORIGIN ?? "http://localhost:3093";
const envelope = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
const setup = await fetch(origin + "/api/setup");
assert.equal(setup.status, 200);
const credentials = {
  email: "settings-http@example.test",
  password: "settings-http-unique-passphrase-43!",
};
const login = await fetch(origin + "/api/setup", {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({
    ...credentials,
    name: "Settings HTTP Operator",
    brandName: "Settings HTTP Studio",
  }),
});
let cookie: string;
if (login.ok) cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
else {
  assert.equal(login.status, 409);
  const response = await fetch(origin + "/api/auth/login", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(credentials),
  });
  assert.equal(
    response.status,
    200,
    "Use a fresh settings HTTP fixture or its known operator.",
  );
  cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
assert.match(cookie, /^pylon_session=[a-f0-9]{64}$/);
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  expected = 200,
  session = cookie,
  requestOrigin = origin,
): Promise<unknown> {
  const response = await fetch(origin + path, {
    method,
    headers: {
      origin: requestOrigin,
      cookie: session,
      "content-type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  assert.equal(response.status, expected, path);
  const result = envelope.parse(await response.json());
  if (path === "/api/account/password" && response.ok) {
    const rotated = response.headers.get("set-cookie") ?? "";
    assert.match(rotated, /^pylon_session=[a-f0-9]{64};/);
    assert.ok(rotated.includes("HttpOnly; SameSite=Lax"));
    assert.ok(!rotated.includes("Domain="));
    assert.deepEqual(result.data, { saved: true });
    cookie = rotated.split(";")[0] ?? "";
  }
  return result.data;
}
const initial = z
  .object({
    allowAutomaticUpdates: z.literal(false),
    invoiceNextNumber: z.number(),
    brandName: z.string(),
  })
  .parse(await call("/api/settings"));
await call("/api/settings", "GET", undefined, 401, "");
await call(
  "/api/settings",
  "PATCH",
  { section: "updates", allowAutomaticUpdates: true },
  403,
  cookie,
  "https://foreign.test",
);
await call(
  "/api/settings",
  "PATCH",
  { section: "updates", allowAutomaticUpdates: "on" },
  400,
);
for (const enabled of [true, true, false]) {
  await call("/api/settings", "PATCH", {
    section: "updates",
    allowAutomaticUpdates: enabled,
  });
  const saved = z
    .object({
      allowAutomaticUpdates: z.boolean(),
      invoiceNextNumber: z.number(),
      brandName: z.string(),
    })
    .parse(await call("/api/settings"));
  assert.equal(saved.allowAutomaticUpdates, enabled);
  assert.equal(saved.invoiceNextNumber, initial.invoiceNextNumber);
  assert.equal(saved.brandName, initial.brandName);
}
const client = z.object({ id: z.uuid() }).parse(
  await call("/api/clients", "POST", {
    name: "Settings recipient",
    email: `settings-${randomUUID()}@example.test`,
  }),
);
const link = z
  .object({ url: z.url() })
  .parse(await call(`/api/clients/${client.id}/generate-link`, "POST", {}));
const token = new URL(link.url).hash.slice(1),
  verified = await fetch(origin + "/api/auth/verify", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
assert.equal(verified.status, 200);
const clientCookie = verified.headers.get("set-cookie")?.split(";")[0] ?? "";
await call("/api/settings", "GET", undefined, 403, clientCookie);
await call(
  "/api/settings",
  "PATCH",
  { section: "updates", allowAutomaticUpdates: true },
  403,
  clientCookie,
);
await call("/api/account/sessions", "GET", undefined, 401, clientCookie);
const publicPage = await (await fetch(origin)).text();
assert.ok(!publicPage.includes("allowAutomaticUpdates"));
assert.ok(!publicPage.includes("allow_automatic_updates"));
const sessions = z
  .array(z.object({ id: z.uuid(), current: z.boolean() }))
  .parse(await call("/api/account/sessions"));
assert.ok(sessions.some((session) => session.current));
const mixed = {
  ...defaultAppearance,
  typography: "humanist",
  finish: "layered",
  lightBackground: "#000000",
  lightSurface: "#ffffff",
  darkBackground: "#ffffff",
  darkSurface: "#000000",
};
await call("/api/settings", "PATCH", { section: "appearance", ...mixed });
assert.deepEqual(
  z
    .object({
      typography: z.literal("humanist"),
      finish: z.literal("layered"),
      lightBackground: z.literal("#000000"),
      lightSurface: z.literal("#ffffff"),
      darkBackground: z.literal("#ffffff"),
      darkSurface: z.literal("#000000"),
    })
    .parse(await call("/api/settings")),
  {
    typography: "humanist",
    finish: "layered",
    lightBackground: "#000000",
    lightSurface: "#ffffff",
    darkBackground: "#ffffff",
    darkSurface: "#000000",
  },
);
await call(
  "/api/settings",
  "PATCH",
  { section: "appearance", ...mixed, lightSurface: "#invalid" },
  400,
);
const oldCookie = cookie;
const otherLogin = await fetch(origin + "/api/auth/login", {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify(credentials),
});
assert.equal(otherLogin.status, 200);
const otherCookie = otherLogin.headers.get("set-cookie")?.split(";")[0] ?? "";
await call(
  "/api/account/password",
  "POST",
  {
    currentPassword: credentials.password,
    newPassword: "short",
    confirmPassword: "short",
  },
  400,
);
const newPassword = "settings-http-changed-passphrase-43!";
await call("/api/account/password", "POST", {
  currentPassword: credentials.password,
  newPassword,
  confirmPassword: newPassword,
});
assert.notEqual(cookie, oldCookie);
await call("/api/settings");
await call("/api/settings", "GET", undefined, 401, oldCookie);
await call("/api/settings", "GET", undefined, 401, otherCookie);
await call("/api/auth/me", "GET", undefined, 200, clientCookie);
await call("/api/auth/login", "POST", credentials, 401);
const relogin = await fetch(origin + "/api/auth/login", {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ ...credentials, password: newPassword }),
});
assert.equal(relogin.status, 200);
cookie = relogin.headers.get("set-cookie")?.split(";")[0] ?? "";
await call("/api/account/password", "POST", {
  currentPassword: newPassword,
  newPassword: credentials.password,
  confirmPassword: credentials.password,
});
await call("/api/settings");
await call("/api/account/sessions", "POST", {
  scope: "all",
  currentPassword: credentials.password,
});
await call("/api/settings", "GET", undefined, 401);
await call("/api/auth/me", "GET", undefined, 200, clientCookie);
process.stdout.write(
  "Installed settings HTTP: custom appearance persistence/isolation, invalid syntax denial, password cookie rotation/continuity, other-session revocation and explicit sign-out-all passed.\n",
);
