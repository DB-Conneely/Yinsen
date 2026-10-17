import "./fixture";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "../src/lib/db/client";
import { readConfiguration } from "../src/lib/config";

const origin = readConfiguration().origin;
const bytes = "Installed private milestone delivery\n";
const envelope = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string() }).nullable(),
});
const fileSchema = z.object({
  id: z.uuid(),
  version: z.number(),
  released: z.boolean(),
  parentDeliverableId: z.uuid().nullable(),
});
async function call(
  path: string,
  method = "GET",
  input?: unknown,
  cookie = "",
): Promise<Response> {
  return fetch(origin + path, {
    method,
    headers: { origin, cookie, "content-type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}
async function data(response: Response, status = 200): Promise<unknown> {
  const result = envelope.parse(await response.json());
  assert.equal(response.status, status, JSON.stringify(result));
  return result.data;
}
async function client(
  operator: string,
): Promise<{ id: string; cookie: string }> {
  const id = z.object({ id: z.uuid() }).parse(
    await data(
      await call(
        "/api/clients",
        "POST",
        {
          name: "HTTP delivery client",
          email: `${randomUUID()}@example.test`,
        },
        operator,
      ),
    ),
  ).id;
  const link = z
    .object({ url: z.url() })
    .parse(
      await data(
        await call(`/api/clients/${id}/generate-link`, "POST", {}, operator),
      ),
    ).url;
  const verified = await call("/api/auth/verify", "POST", {
    token: new URL(link).hash.slice(1),
  });
  await data(verified);
  const cookie = verified.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return { id, cookie };
}
function upload(
  milestoneId: string,
  cookie: string,
  id = randomUUID(),
  parent?: string,
  content = bytes,
): Promise<Response> {
  const body = new FormData();
  body.set("requestId", id);
  if (parent) body.set("parentDeliverableId", parent);
  body.set(
    "file",
    new Blob([content], { type: "text/plain" }),
    "private-delivery.txt",
  );
  return fetch(`${origin}/api/milestones/${milestoneId}/deliverables`, {
    method: "POST",
    headers: { origin, cookie },
    body,
  });
}
try {
  const login = await call("/api/auth/login", "POST", {
    email: "operator@example.test",
    password: "remote-proof-password-12!",
  });
  await data(login);
  const operator = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(operator);
  const primary = await client(operator),
    outsider = await client(operator);
  const project = z.object({ id: z.uuid() }).parse(
    await data(
      await call(
        "/api/projects",
        "POST",
        {
          name: "Installed delivery handoff",
          currency: "GBP",
          clientIds: [primary.id],
        },
        operator,
      ),
    ),
  );
  const milestones = z.object({
    milestones: z.array(z.object({ id: z.uuid() })),
  });
  const milestone = milestones.parse(
    await data(
      await call(
        `/api/projects/${project.id}/milestones`,
        "POST",
        { name: "Delivery" },
        operator,
      ),
    ),
  ).milestones[0];
  assert.ok(milestone);
  const other = milestones
    .parse(
      await data(
        await call(
          `/api/projects/${project.id}/milestones`,
          "POST",
          { name: "Unrelated milestone" },
          operator,
        ),
      ),
    )
    .milestones.find((item) => item.id !== milestone.id);
  assert.ok(other);
  const id = randomUUID();
  const first = fileSchema.parse(
    await data(await upload(milestone.id, operator, id)),
  );
  assert.equal(first.released, false);
  assert.equal(first.version, 1);
  const download = `/api/deliverables/${id}/download`;
  assert.equal((await call(download)).status, 401);
  assert.equal(
    (await call(download, "GET", undefined, outsider.cookie)).status,
    404,
  );
  const foreignDenial: unknown = await (
    await call(download, "GET", undefined, outsider.cookie)
  ).json();
  const unknownDenial: unknown = await (
    await call(
      `/api/deliverables/${randomUUID()}/download`,
      "GET",
      undefined,
      outsider.cookie,
    )
  ).json();
  assert.deepEqual(foreignDenial, unknownDenial);
  assert.equal(
    (await call(download, "GET", undefined, primary.cookie)).status,
    402,
  );
  assert.equal(
    await (await call(download, "GET", undefined, operator)).text(),
    bytes,
  );
  assert.equal((await upload(milestone.id, primary.cookie)).status, 403);
  await data(await upload(other.id, operator, randomUUID(), id), 404);
  await data(
    await upload(milestone.id, operator, randomUUID(), randomUUID()),
    404,
  );
  await data(
    await call(
      `/api/deliverables/${id}`,
      "PATCH",
      { released: true },
      primary.cookie,
    ),
    403,
  );
  await data(
    await call(
      `/api/deliverables/${id}`,
      "PATCH",
      { released: true },
      operator,
    ),
  );
  const released = await call(download, "GET", undefined, primary.cookie);
  assert.equal(released.status, 200);
  assert.match(released.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(await released.text(), bytes);
  const replay = fileSchema.parse(
    await data(await upload(milestone.id, operator, id)),
  );
  assert.equal(replay.id, id);
  assert.equal(replay.version, 1);
  await data(
    await upload(milestone.id, operator, id, undefined, "Changed payload"),
    409,
  );
  const replies = await Promise.all([
    upload(milestone.id, operator, randomUUID(), id),
    upload(milestone.id, operator, randomUUID(), id),
  ]);
  const versions = await Promise.all(
    replies.map(async (response) => fileSchema.parse(await data(response))),
  );
  assert.deepEqual(versions.map((file) => file.version).sort(), [2, 3]);
  for (const file of versions) {
    assert.equal(file.released, false);
    assert.equal(
      (
        await call(
          `/api/deliverables/${file.id}/download`,
          "GET",
          undefined,
          primary.cookie,
        )
      ).status,
      402,
    );
  }
  await data(
    await call(
      `/api/deliverables/${id}`,
      "PATCH",
      { released: false },
      operator,
    ),
  );
  assert.equal(
    (await call(download, "GET", undefined, primary.cookie)).status,
    402,
  );
  await data(
    await upload(
      milestone.id,
      operator,
      randomUUID(),
      undefined,
      "x".repeat(1048577),
    ),
    413,
  );
  const rows = await getSql()<
    { sha256: string; size: number }[]
  >`select sha256,size::float8 as size from deliverables where id=${id}`;
  assert.equal(
    rows[0]?.sha256,
    createHash("sha256").update(bytes).digest("hex"),
  );
  assert.equal(rows[0]?.size, Buffer.byteLength(bytes));
  assert.equal(
    (
      await getSql()`select id from deliverables where milestone_id=${milestone.id}`
    ).length,
    3,
  );
  const revision = z
    .object({ editRevision: z.string() })
    .parse(
      await data(
        await call(`/api/projects/${project.id}`, "GET", undefined, operator),
      ),
    ).editRevision;
  await data(
    await call(
      `/api/projects/${project.id}`,
      "PATCH",
      { clientIds: [outsider.id], expectedRevision: revision },
      operator,
    ),
  );
  assert.equal(
    (await call(download, "GET", undefined, primary.cookie)).status,
    404,
  );
  process.stdout.write(
    "Installed deliverable upload, lineage, replay/races, per-version release/relock, exact bytes, bounds and current authorization passed.\n",
  );
} finally {
  await getSql().end();
}
