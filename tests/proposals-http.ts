import "./fixture";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { z } from "zod";
import { getSql } from "../src/lib/db/client";
import { proposalView } from "../src/lib/messages/proposal-validators";

const origin = process.env.APP_ORIGIN ?? "";
const envelope = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
const page = z.object({
  messages: z.array(
    z.object({
      id: z.uuid(),
      type: z.string(),
      proposal: proposalView.nullable(),
    }),
  ),
});
const terms = {
  name: "HTTP negotiated project",
  description: "Exact HTTP agreement",
  budget: 76543,
  currency: "EUR",
  milestones: [
    { name: "First", description: "One", dueDate: "2027-03-10" },
    { name: "Second", description: "Two", dueDate: null },
  ],
};
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  expected = 200,
): Promise<z.infer<typeof envelope>> {
  const response = await fetch(origin + path, {
    method,
    headers: { origin, "content-type": "application/json", cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = envelope.parse(await response.json());
  assert.equal(response.status, expected, JSON.stringify(result));
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  return result;
}
async function createClient(
  name: string,
  operator: string,
): Promise<{ id: string; cookie: string }> {
  const id = z
    .object({ id: z.uuid() })
    .parse(
      (
        await call(
          "/api/clients",
          "POST",
          { name, email: `${randomUUID()}@example.test` },
          operator,
        )
      ).data,
    ).id;
  const url = z
    .object({ url: z.string() })
    .parse(
      (await call(`/api/clients/${id}/generate-link`, "POST", {}, operator))
        .data,
    ).url;
  const response = await fetch(origin + "/api/auth/verify", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ token: new URL(url).hash.slice(1) }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return { id, cookie };
}
const action = (
  type: "proposal" | "counter" | "accept" | "reject",
  proposalId?: string,
  amended = terms,
): Record<string, unknown> => ({
  type,
  requestId: randomUUID(),
  ...(proposalId ? { proposalId } : {}),
  ...(type === "proposal" || type === "counter" ? { terms: amended } : {}),
});
const idFrom = (result: z.infer<typeof envelope>): string => {
  const id = page.parse(result.data).messages.at(-1)?.id;
  assert.ok(id);
  return id;
};

try {
  const login = await fetch(origin + "/api/auth/login", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      email: "operator@example.test",
      password: "remote-proof-password-12!",
    }),
  });
  assert.equal(login.status, 200);
  const operator = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(operator);
  const client = await createClient("HTTP proposal primary", operator),
    foreign = await createClient("HTTP proposal foreign", operator);
  const path = `/api/clients/${client.id}/messages`;
  const first = idFrom(await call(path, "POST", action("proposal"), operator));
  await call(path, "POST", action("accept", first), operator, 403);
  await call(path, "POST", action("counter", first), foreign.cookie, 404);
  const counter = idFrom(
    await call(
      path,
      "POST",
      action("counter", first, {
        ...terms,
        name: "HTTP counter",
        budget: 86543,
      }),
      client.cookie,
    ),
  );
  await call(path, "POST", action("accept", first), client.cookie, 409);
  const final = idFrom(
    await call(
      path,
      "POST",
      action("counter", counter, {
        ...terms,
        name: "HTTP final",
        budget: 96543,
      }),
      operator,
    ),
  );
  const accept = action("accept", final),
    accepted = await call(path, "POST", accept, client.cookie);
  const projectId = page
    .parse(accepted.data)
    .messages.find((row) => row.id === accept.requestId)?.proposal?.projectId;
  assert.ok(projectId);
  const project = z
    .object({
      name: z.string(),
      status: z.string(),
      budget: z.number(),
      currency: z.string(),
      members: z.array(z.object({ id: z.uuid(), role: z.string() })),
      milestones: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          dueDate: z.string().nullable(),
        }),
      ),
    })
    .parse(
      (
        await call(
          `/api/projects/${projectId}`,
          "GET",
          undefined,
          client.cookie,
        )
      ).data,
    );
  assert.equal(project.status, "active");
  assert.equal(project.name, "HTTP final");
  assert.equal(project.budget, 96543);
  assert.equal(project.currency, "EUR");
  assert.deepEqual(
    project.members.map((row) => [row.id, row.role]),
    [[client.id, "primary"]],
  );
  assert.deepEqual(
    project.milestones.map((row) => ({
      name: row.name,
      description: row.description,
      dueDate: row.dueDate,
    })),
    terms.milestones,
  );
  await call(path, "POST", accept, client.cookie);
  await call(path, "POST", action("accept", final), client.cookie, 409);
  assert.equal(
    (await getSql()`select id from projects where proposal_message_id=${final}`)
      .length,
    1,
  );
  await call(
    `/api/projects/${projectId}/lock-in`,
    "POST",
    {},
    client.cookie,
    409,
  );
  await call(
    `/api/projects/${projectId}`,
    "GET",
    undefined,
    foreign.cookie,
    404,
  );
  const cards = page.parse(
    (await call(path, "GET", undefined, client.cookie)).data,
  );
  assert.equal(
    cards.messages
      .filter((row) => row.proposal?.chainId === first)
      .every(
        (row) =>
          !row.proposal?.canRespond && row.proposal?.state === "accepted",
      ),
    true,
  );

  const reverse = idFrom(
    await call(path, "POST", action("proposal"), client.cookie),
  );
  await call(path, "POST", action("accept", reverse), operator);
  const decline = idFrom(
    await call(path, "POST", action("proposal"), operator),
  );
  await call(path, "POST", action("reject", decline), client.cookie);
  assert.equal(
    (
      await getSql()`select id from projects where proposal_message_id=${decline}`
    ).length,
    0,
  );
  const racing = idFrom(
    await call(path, "POST", action("proposal"), client.cookie),
  );
  const races = await Promise.all(
    ["accept", "accept", "counter", "reject"].map((type) =>
      fetch(origin + path, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: operator,
        },
        body: JSON.stringify(
          action(z.enum(["accept", "counter", "reject"]).parse(type), racing),
        ),
      }),
    ),
  );
  assert.equal(races.filter((row) => row.status === 200).length, 1);
  assert.equal(races.filter((row) => row.status === 409).length, 3);
  assert.equal(
    (await getSql()`select id from messages where reply_to=${racing}`).length,
    1,
  );

  const rollback = idFrom(
      await call(path, "POST", action("proposal"), operator),
    ),
    retry = action("accept", rollback);
  const migrator = postgres(process.env.MIGRATION_DATABASE_URL ?? "", {
    max: 1,
    ssl: false,
  });
  try {
    await migrator`revoke insert on milestones from yinsen_runtime`;
    await call(path, "POST", retry, client.cookie, 503);
    assert.equal(
      (
        await getSql()`select id from projects where proposal_message_id=${rollback}`
      ).length,
      0,
    );
    assert.equal(
      (
        await getSql()`select id from messages where id=${String(retry.requestId)}`
      ).length,
      0,
    );
  } finally {
    await migrator`grant insert on milestones to yinsen_runtime`;
    await migrator.end();
  }
  await call(path, "POST", retry, client.cookie);
  await call(path, "POST", retry, client.cookie);
  assert.equal(
    (
      await getSql()`select id from projects where proposal_message_id=${rollback}`
    ).length,
    1,
  );

  const unknown = await call(
    `/api/clients/${randomUUID()}/messages`,
    "POST",
    action("accept", randomUUID()),
    foreign.cookie,
    404,
  );
  const denied = await call(
    path,
    "POST",
    action("accept", randomUUID()),
    foreign.cookie,
    404,
  );
  assert.deepEqual(unknown, denied);
  await call(path, "POST", action("proposal"), "", 401);
  const csrf = await fetch(origin + path, {
    method: "POST",
    headers: {
      origin: "https://foreign.invalid",
      "content-type": "application/json",
      cookie: operator,
    },
    body: JSON.stringify(action("proposal")),
  });
  assert.equal(csrf.status, 403);
  await call(
    path,
    "POST",
    { ...action("proposal"), actorId: client.id },
    operator,
    400,
  );
  await call(
    `/api/projects/${projectId}/messages`,
    "POST",
    action("proposal"),
    operator,
    400,
  );
  process.stdout.write(
    "Installed proposals HTTP: both directions, multiple counters, active project/ordered terms, replay/races, real rollback/retry and current auth/CSRF passed.\n",
  );
} finally {
  await getSql().end({ timeout: 5 });
}
