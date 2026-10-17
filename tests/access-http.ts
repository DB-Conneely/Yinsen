import assert from "node:assert/strict";
import "./fixture";
import { createHash } from "node:crypto";
import postgres from "postgres";

const origin = process.env.TEST_ORIGIN ?? process.env.APP_ORIGIN;
assert.ok(origin, "Set TEST_ORIGIN for the deliberate synthetic installation.");
assert.equal(process.env.TEST_ISOLATED_DATABASE, "1");
const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const admin = postgres(process.env.MIGRATION_DATABASE_URL ?? "", { max: 1 });
const input = {
  email: "operator@example.test",
  password: "remote-proof-password-12!",
};
async function write(
  path: string,
  body: unknown,
  cookie = "",
  extra: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin ?? "",
      Cookie: cookie,
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
function cookieOf(response: Response): string {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}
try {
  assert.equal((await fetch(`${origin}/api/auth/me`)).status, 401);
  const deep = await fetch(`${origin}/dashboard`, { redirect: "manual" });
  assert.equal(deep.status, 307);
  assert.ok(deep.headers.get("location")?.endsWith("/login"));
  assert.equal((await fetch(`${origin}/setup`)).status, 404);
  assert.equal(
    (
      await write("/api/setup", { name: "intruder" }, "", {
        Origin: "https://attacker.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await write("/api/auth/login", input, "", {
        Origin: "https://attacker.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await write("/api/auth/login", input, "", {
        "Content-Type": "text/plain",
      })
    ).status,
    415,
  );
  const login = await write("/api/auth/login", input);
  assert.equal(login.status, 200);
  const cookie = cookieOf(login);
  assert.match(
    login.headers.get("set-cookie") ?? "",
    /HttpOnly; SameSite=Lax; Max-Age=7776000; Secure/,
  );
  const payload: unknown = await login.json();
  assert.ok(!JSON.stringify(payload).includes(input.password));
  const dashboard = await fetch(`${origin}/dashboard`, {
    headers: { Cookie: cookie },
  });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /Welcome.*Remote Operator/);
  assert.match(dashboard.headers.get("set-cookie") ?? "", /Max-Age=7776000/);
  assert.match(dashboard.headers.get("cache-control") ?? "", /no-store/);
  for (const [path, title] of [
    ["/", "Welcome"],
    ["/login", "Operator login"],
    ["/operator-guide", "Installation configuration"],
    ["/dashboard", "Operator dashboard"],
    ["/dashboard/clients", "Clients"],
    ["/dashboard/clients/new", "New client"],
    ["/portal/login", "Client login"],
    ["/portal/verify", "Confirm client login"],
  ]) {
    const response: Response = await fetch(`${origin}${path}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200);
    assert.ok(
      (await response.text()).includes(
        `<title>${title} | Client portal</title>`,
      ),
      `Missing descriptive title on ${path}`,
    );
  }
  try {
    await admin`revoke update on operator_sessions from yinsen_runtime`;
    const failed = await fetch(`${origin}/dashboard`, {
      headers: { Cookie: cookie },
    });
    assert.equal(failed.status, 500);
    assert.equal(failed.headers.get("set-cookie"), null);
    for (const header of [
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
      "strict-transport-security",
    ])
      assert.ok(
        failed.headers.get(header),
        `Missing ${header} on safe failure`,
      );
    const body = await failed.text();
    // The browser hydrates the framework's Reload control from this error document.
    assert.match(body, /<html id="__next_error__">/);
    assert.doesNotMatch(body, /Welcome, Remote Operator/);
    assert.equal(
      (await fetch(`${origin}/api/auth/me`, { headers: { Cookie: cookie } }))
        .status,
      503,
    );
  } finally {
    await admin`grant update on operator_sessions to yinsen_runtime`;
  }
  const recovered = await fetch(`${origin}/dashboard`, {
    headers: { Cookie: cookie },
  });
  assert.equal(recovered.status, 200);
  assert.match(recovered.headers.get("set-cookie") ?? "", /Max-Age=7776000/);
  assert.equal(
    (
      await write("/api/auth/logout", {}, cookie, {
        Origin: "https://attacker.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${origin}/api/auth/me`, { headers: { Cookie: cookie } }))
      .status,
    200,
  );
  const token = cookie.slice("pylon_session=".length);
  const hash = createHash("sha256").update(token).digest("hex");
  await sql`update operator_sessions set expires_at = now() - interval '1 second' where token_hash = ${hash}`;
  assert.equal(
    (await fetch(`${origin}/api/auth/me`, { headers: { Cookie: cookie } }))
      .status,
    401,
  );
  assert.equal(
    (
      await fetch(`${origin}/dashboard`, {
        headers: { Cookie: cookie },
        redirect: "manual",
      })
    ).status,
    307,
  );
  const next = await write("/api/auth/login", input);
  assert.equal(next.status, 200);
  const nextCookie = cookieOf(next);
  assert.equal((await write("/api/auth/logout", {}, nextCookie)).status, 200);
  assert.equal(
    (await fetch(`${origin}/api/auth/me`, { headers: { Cookie: nextCookie } }))
      .status,
    401,
  );
  const unknown = await write("/api/auth/login", {
    email: "absent@example.test",
    password: "wrong password",
  });
  const wrong = await write("/api/auth/login", {
    ...input,
    password: "wrong password",
  });
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.deepEqual(await unknown.json(), await wrong.json());
  const attempts: number[] = [];
  for (let i = 0; i < 6; i++)
    attempts.push(
      (
        await write("/api/auth/login", input, "", {
          "X-Forwarded-For": `192.0.2.${i}`,
          "X-Real-IP": `192.0.2.${i}`,
        })
      ).status,
    );
  assert.ok(attempts.includes(429));
  assert.equal(attempts.at(-1), 429);
  const columns =
    await sql`select column_name from information_schema.columns where table_name = 'operator_sessions'`;
  assert.ok(columns.some((row) => row.column_name === "token_hash"));
  assert.ok(!columns.some((row) => row.column_name === "token"));
  process.stdout.write(
    `Installed access passed: ${origin}; expiry/revocation, CSRF, cookie renewal, protected pages and forwarded-header rotation denial.\n`,
  );
} finally {
  await sql.end();
  await admin.end();
}
