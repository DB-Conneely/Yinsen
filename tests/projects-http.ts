import "./fixture";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "../src/lib/db/client";

const origin = process.env.APP_ORIGIN ?? "";
const resultSchema = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
type Credential = { cookie: string };
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  credential?: Credential,
): Promise<{
  response: Response;
  data: unknown;
  error: z.infer<typeof resultSchema>["error"];
}> {
  const response = await fetch(origin + path, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      cookie: credential?.cookie ?? "",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = resultSchema.parse(await response.json());
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  return { response, ...result };
}
const idFrom = (data: unknown): string =>
  z.object({ id: z.uuid() }).parse(data).id;
async function client(
  name: string,
  operator: Credential,
): Promise<{ id: string; credential: Credential }> {
  const saved = await call(
    "/api/clients",
    "POST",
    { name, email: `${randomUUID()}@example.test` },
    operator,
  );
  assert.equal(saved.response.status, 200);
  const id = idFrom(saved.data);
  const issued = await call(
    `/api/clients/${id}/generate-link`,
    "POST",
    {},
    operator,
  );
  const url = z.object({ url: z.string() }).parse(issued.data).url;
  const verified = await call("/api/auth/verify", "POST", {
    token: new URL(url).hash.slice(1),
  });
  assert.equal(verified.response.status, 200);
  const cookie = verified.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return { id, credential: { cookie } };
}

try {
  const login = await call("/api/auth/login", "POST", {
    email: "operator@example.test",
    password: "remote-proof-password-12!",
  });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const operator = { cookie };
  const primary = await client("HTTP primary", operator),
    member = await client("HTTP member", operator),
    outsider = await client("HTTP outsider", operator);
  const created = await call(
    "/api/projects",
    "POST",
    {
      name: "Installed HTTP project",
      description: "Current contract",
      currency: "JPY",
      budget: 2147483647,
      clientIds: [primary.id, member.id],
    },
    operator,
  );
  assert.equal(created.response.status, 200);
  const id = idFrom(created.data),
    path = `/api/projects/${id}`;
  assert.equal((await call(path)).response.status, 401);
  const foreign = await call(path, "GET", undefined, outsider.credential),
    absent = await call(
      `/api/projects/${randomUUID()}`,
      "GET",
      undefined,
      outsider.credential,
    );
  assert.equal(foreign.response.status, 404);
  assert.deepEqual(foreign.error, absent.error);
  assert.equal(
    (await call(path, "PATCH", { budget: 2147483648 }, operator)).response
      .status,
    400,
  );
  assert.equal(
    (await call(path, "PATCH", { status: "active" }, operator)).response.status,
    409,
  );
  assert.equal(
    (await call(path, "PATCH", { status: "pending_lockin" }, operator)).response
      .status,
    200,
  );
  assert.equal(
    (await call(path + "/lock-in", "POST", {}, operator)).response.status,
    403,
  );
  const locks = await Promise.all([
    call(path + "/lock-in", "POST", {}, member.credential),
    call(path + "/lock-in", "POST", {}, primary.credential),
  ]);
  assert.deepEqual(
    locks.map((entry) => entry.response.status).sort(),
    [200, 409],
  );
  const milestone = await call(
    path + "/milestones",
    "POST",
    { name: "HTTP milestone", description: "Keep me", dueDate: "2026-11-01" },
    operator,
  );
  assert.equal(milestone.response.status, 200);
  const m = z
    .object({ milestones: z.array(z.object({ id: z.uuid() })).min(1) })
    .parse(milestone.data).milestones[0];
  assert.ok(m);
  const milestonePath = `/api/milestones/${m.id}`;
  assert.equal(
    (await call(milestonePath, "PATCH", { status: "in_progress" }, operator))
      .response.status,
    200,
  );
  assert.equal(
    (await call(milestonePath, "PATCH", { status: "review" }, operator))
      .response.status,
    200,
  );
  assert.equal(
    (await call(milestonePath + "/approve", "POST", {}, member.credential))
      .response.status,
    403,
  );
  assert.equal(
    (await call(milestonePath + "/approve", "POST", {}, operator)).response
      .status,
    403,
  );
  const approvals = await Promise.all([
    call(milestonePath + "/approve", "POST", {}, primary.credential),
    call(milestonePath + "/approve", "POST", {}, primary.credential),
  ]);
  assert.deepEqual(
    approvals.map((entry) => entry.response.status).sort(),
    [200, 409],
  );
  assert.equal(
    (await call(path, "PATCH", { status: "paused" }, operator)).response.status,
    200,
  );
  assert.equal(
    (await call(path, "PATCH", { status: "active" }, operator)).response.status,
    200,
  );
  const facts =
    await getSql()`select m.description,m.due_date::text,m.status,p.budget,p.status as project_status from milestones m join projects p on p.id=m.project_id where m.id=${m.id}`;
  assert.deepEqual(
    { ...facts[0] },
    {
      description: "Keep me",
      due_date: "2026-11-01",
      status: "approved",
      budget: 2147483647,
      project_status: "active",
    },
  );
  assert.equal(
    (await call(path, "PATCH", { clientIds: [primary.id] }, operator)).response
      .status,
    200,
  );
  assert.equal(
    (await call(path, "GET", undefined, member.credential)).response.status,
    404,
  );
  const wrongOrigin = await fetch(origin + path, {
    method: "PATCH",
    headers: {
      origin: "https://foreign.test",
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify({ name: "Forged" }),
  });
  assert.equal(wrongOrigin.status, 403);
  assert.equal((await call(path, "DELETE", {}, operator)).response.status, 200);
  assert.equal(
    (await call(path, "GET", undefined, operator)).response.status,
    404,
  );
  process.stdout.write(
    "Installed project HTTP/SQL proof passed: role/scope/CSRF denial, max integer budget, concurrent lock-in/approval, milestone preservation, pause/resume, removal and soft delete.\n",
  );
} finally {
  await getSql().end();
}
