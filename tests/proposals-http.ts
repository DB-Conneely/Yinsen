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

async function dateBoundaries(
  path: string,
  operator: string,
  client: string,
): Promise<void> {
  for (const dueDate of ["0000-01-01", "2027-02-30", "10000-01-01"]) {
    const invalid = action("proposal", undefined, {
      ...terms,
      milestones: [{ name: "Invalid date", description: "", dueDate }],
    });
    await call(path, "POST", invalid, operator, 400);
    assert.equal(
      (
        await getSql()`select id from messages where id=${String(invalid.requestId)}`
      ).length,
      0,
    );
  }
  const target = idFrom(await call(path, "POST", action("proposal"), operator));
  const invalidCounter = action("counter", target, {
    ...terms,
    milestones: [
      { name: "Invalid counter", description: "", dueDate: "0000-01-01" },
    ],
  });
  await call(path, "POST", invalidCounter, client, 400);
  assert.equal(
    (await getSql()`select id from messages where reply_to=${target}`).length,
    0,
  );
  await call(path, "POST", action("reject", target), client);
  for (const dueDate of ["0001-01-01", "9999-12-31", null]) {
    const proposalId = idFrom(
      await call(
        path,
        "POST",
        action("proposal", undefined, {
          ...terms,
          milestones: [{ name: "Supported date", description: "", dueDate }],
        }),
        operator,
      ),
    );
    await call(path, "POST", action("accept", proposalId), client);
    const rows =
      await getSql()`select m.due_date::text as "dueDate" from milestones m join projects p on m.project_id=p.id where p.proposal_message_id=${proposalId}`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.dueDate, dueDate);
  }
}

async function historicalDates(
  path: string,
  operator: string,
  client: { id: string; cookie: string },
): Promise<void> {
  const actor = await getSql()`select id from operator`;
  assert.ok(actor[0]);
  const historic = {
    ...terms,
    milestones: [
      {
        name: "Historical unsupported date",
        description: "",
        dueDate: "0000-01-01",
      },
    ],
  };
  for (const recovery of ["reject", "counter"] as const) {
    const proposalId = randomUUID();
    // Preserve the format accepted before the date boundary was repaired.
    await getSql()`insert into messages(id,client_id,sender_type,sender_id,body,fingerprint,type,chain_id,proposal_data) values(${proposalId},${client.id},'operator',${String(actor[0].id)},'Historical unsupported date',${proposalId},'proposal',${proposalId},${JSON.stringify(historic)}::text::jsonb)`;
    const stored = await getSql()<
      { shape: string }[]
    >`select jsonb_typeof(proposal_data) as shape from messages where id=${proposalId}`;
    assert.equal(stored[0]?.shape, "object");
    const cards = page.parse(
      (await call(path, "GET", undefined, client.cookie)).data,
    );
    assert.deepEqual(
      cards.messages.find((row) => row.id === proposalId)?.proposal?.terms,
      historic,
    );
    const before = Array.from(
      await getSql()`select (select count(*) from projects)::int as projects,(select count(*) from project_clients)::int as members,(select count(*) from milestones)::int as milestones,(select count(*) from project_activity)::int as activity`,
    );
    const accept = action("accept", proposalId);
    for (let attempt = 0; attempt < 2; attempt++) {
      const denied = await call(path, "POST", accept, client.cookie, 400);
      assert.equal(denied.error?.code, "PROPOSAL_TERMS_INVALID");
      assert.match(denied.error.message, /Counter.*dates.*reject/);
    }
    assert.deepEqual(
      Array.from(
        await getSql()`select (select count(*) from projects)::int as projects,(select count(*) from project_clients)::int as members,(select count(*) from milestones)::int as milestones,(select count(*) from project_activity)::int as activity`,
      ),
      before,
    );
    assert.equal(
      (await getSql()`select id from messages where reply_to=${proposalId}`)
        .length,
      0,
    );
    const result = await call(
      path,
      "POST",
      action(recovery, proposalId),
      client.cookie,
    );
    if (recovery === "counter")
      await call(path, "POST", action("accept", idFrom(result)), operator);
    const persisted =
      await getSql()`select proposal_data::text as terms from messages where id=${proposalId}`;
    assert.deepEqual(JSON.parse(String(persisted[0]?.terms)), historic);
  }
}

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
      lockRevision: z.string(),
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
    { expectedRevision: project.lockRevision },
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
  await dateBoundaries(path, operator, client.cookie);
  await historicalDates(path, operator, client);

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
    "Installed proposals HTTP: both directions, multiple counters, date boundaries/historic recovery, active project/ordered terms, replay/races, real rollback/retry and current auth/CSRF passed.\n",
  );
} finally {
  await getSql().end({ timeout: 5 });
}
