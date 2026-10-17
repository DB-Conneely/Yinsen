import "./fixture";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "../src/lib/db/client";
import { readConfiguration } from "../src/lib/config";

const origin = readConfiguration().origin;
assert.equal(
  Boolean(readConfiguration().email),
  false,
  "Use the deliberate no-provider invoice fixture.",
);
const envelope = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string() }).nullable(),
});
const invoiceSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  status: z.string(),
  amount: z.number(),
  revision: z.string(),
  recipientName: z.string(),
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
  const { id } = z.object({ id: z.uuid() }).parse(
    await data(
      await call(
        "/api/clients",
        "POST",
        {
          name: "HTTP invoice recipient",
          email: `${randomUUID()}@example.test`,
        },
        operator,
      ),
    ),
  );
  const { url } = z
    .object({ url: z.url() })
    .parse(
      await data(
        await call(`/api/clients/${id}/generate-link`, "POST", {}, operator),
      ),
    );
  const response = await call("/api/auth/verify", "POST", {
    token: new URL(url).hash.slice(1),
  });
  await data(response);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return { id, cookie };
}
async function upload(
  milestone: string,
  cookie: string,
  parent?: string,
): Promise<string> {
  const body = new FormData();
  body.set("requestId", randomUUID());
  if (parent) body.set("parentDeliverableId", parent);
  body.set(
    "file",
    new Blob(["Invoice-triggered private bytes\n"], { type: "text/plain" }),
    "invoice-delivery.txt",
  );
  return z.object({ id: z.uuid() }).parse(
    await data(
      await fetch(`${origin}/api/milestones/${milestone}/deliverables`, {
        method: "POST",
        headers: { origin, cookie },
        body,
      }),
    ),
  ).id;
}
try {
  if (!(await getSql()`select id from operator`).length)
    await data(
      await call("/api/setup", "POST", {
        name: "Remote Operator",
        email: "operator@example.test",
        password: "remote-proof-password-12!",
        brandName: "Invoice Studio",
        brandColour: "#2457a7",
        defaultCurrency: "GBP",
      }),
    );
  const login = await call("/api/auth/login", "POST", {
    email: "operator@example.test",
    password: "remote-proof-password-12!",
  });
  await data(login);
  const operator = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(operator);
  const recipient = await client(operator),
    outsider = await client(operator);
  const project = z.object({ id: z.uuid() }).parse(
    await data(
      await call(
        "/api/projects",
        "POST",
        {
          name: "Invoice HTTP work",
          currency: "GBP",
          clientIds: [recipient.id, outsider.id],
        },
        operator,
      ),
    ),
  );
  const milestones = z
    .object({ milestones: z.array(z.object({ id: z.uuid() })) })
    .parse(
      await data(
        await call(
          `/api/projects/${project.id}/milestones`,
          "POST",
          { name: "Invoice release milestone" },
          operator,
        ),
      ),
    );
  const milestoneId = milestones.milestones[0]?.id;
  assert.ok(milestoneId);
  const root = await upload(milestoneId, operator),
    version = await upload(milestoneId, operator, root);
  const fields = {
    clientId: recipient.id,
    projectId: project.id,
    currency: "GBP",
    lineItems: [{ description: "Design", quantity: "1.25", unitPrice: 10001 }],
    milestoneIds: [milestoneId],
    notes: "Installed HTTP invoice",
  };
  const draft = async (
    patch: unknown = {},
  ): Promise<z.infer<typeof invoiceSchema>> =>
    invoiceSchema.parse(
      await data(
        await call(
          "/api/invoices",
          "POST",
          {
            ...fields,
            ...z.record(z.string(), z.unknown()).parse(patch),
            requestId: randomUUID(),
          },
          operator,
        ),
      ),
    );
  const all = await Promise.all(Array.from({ length: 6 }, () => draft()));
  assert.equal(new Set(all.map((item) => item.number)).size, 6);
  const first = all[0];
  assert.ok(first);
  assert.equal(first.amount, 12501);
  await data(
    await call(`/api/invoices/${first.id}`, "GET", undefined, recipient.cookie),
    404,
  );
  await data(
    await call(
      "/api/invoices",
      "POST",
      { ...fields, requestId: randomUUID() },
      recipient.cookie,
    ),
    403,
  );
  await data(
    await call(
      "/api/invoices",
      "POST",
      { ...fields, projectId: null, requestId: randomUUID() },
      operator,
    ),
    400,
  );
  await data(
    await call(
      `/api/invoices/${first.id}`,
      "PATCH",
      { ...fields, totalOverride: 12000, expectedRevision: first.revision },
      operator,
    ),
  );
  const edited = invoiceSchema.parse(
    await data(
      await call(`/api/invoices/${first.id}`, "GET", undefined, operator),
    ),
  );
  assert.equal(edited.number, first.number);
  const sent = invoiceSchema.parse(
    await data(
      await call(
        `/api/invoices/${first.id}/send`,
        "POST",
        { expectedRevision: edited.revision },
        operator,
      ),
    ),
  );
  assert.equal(sent.status, "sent");
  await data(
    await call(`/api/invoices/${first.id}`, "GET", undefined, recipient.cookie),
  );
  const denial = await call(
      `/api/invoices/${first.id}`,
      "GET",
      undefined,
      outsider.cookie,
    ),
    unknown = await call(
      `/api/invoices/${randomUUID()}`,
      "GET",
      undefined,
      outsider.cookie,
    );
  assert.equal(denial.status, 404);
  assert.deepEqual(await denial.json(), await unknown.json());
  await data(
    await call(
      `/api/invoices/${first.id}/send`,
      "POST",
      { expectedRevision: sent.revision },
      operator,
    ),
    409,
  );
  await data(
    await call(
      `/api/invoices/${first.id}`,
      "PATCH",
      { ...fields, expectedRevision: sent.revision },
      operator,
    ),
    409,
  );
  await data(
    await call(`/api/milestones/${milestoneId}`, "DELETE", {}, operator),
    409,
  );
  assert.equal(
    (
      await call(
        `/api/deliverables/${root}/download`,
        "GET",
        undefined,
        recipient.cookie,
      )
    ).status,
    402,
  );
  const receipt = {
    amountReceived: sent.amount,
    paymentMethod: "bank_transfer",
    reference: "HTTP bank reference",
  };
  for (const amountReceived of [sent.amount - 1, sent.amount + 1])
    await data(
      await call(
        `/api/invoices/${sent.id}/settle`,
        "POST",
        { ...receipt, amountReceived },
        operator,
      ),
      400,
    );
  await data(
    await call(
      `/api/invoices/${sent.id}/settle`,
      "POST",
      receipt,
      recipient.cookie,
    ),
    403,
  );
  await data(
    await call(`/api/invoices/${sent.id}/settle`, "POST", receipt, operator),
  );
  for (const id of [root, version]) {
    const response = await call(
      `/api/deliverables/${id}/download`,
      "GET",
      undefined,
      recipient.cookie,
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "Invoice-triggered private bytes\n");
  }
  const later = await upload(milestoneId, operator, root);
  await data(
    await call(
      `/api/deliverables/${version}`,
      "PATCH",
      { released: false },
      operator,
    ),
  );
  await data(
    await call(`/api/invoices/${sent.id}/settle`, "POST", receipt, operator),
  );
  assert.equal(
    (
      await call(
        `/api/deliverables/${version}/download`,
        "GET",
        undefined,
        recipient.cookie,
      )
    ).status,
    402,
  );
  assert.equal(
    (
      await call(
        `/api/deliverables/${later}/download`,
        "GET",
        undefined,
        recipient.cookie,
      )
    ).status,
    402,
  );
  await data(
    await call(`/api/invoices/${sent.id}`, "DELETE", {}, operator),
    409,
  );
  await data(
    await call(`/api/milestones/${milestoneId}`, "DELETE", {}, operator),
    409,
  );
  const unlinked = await draft({ milestoneIds: [] });
  await data(
    await call(
      `/api/invoices/${unlinked.id}/send`,
      "POST",
      { expectedRevision: unlinked.revision },
      operator,
    ),
  );
  await data(
    await call(
      `/api/invoices/${unlinked.id}/settle`,
      "POST",
      { ...receipt, amountReceived: unlinked.amount },
      operator,
    ),
  );
  assert.equal(
    (
      await call(
        `/api/deliverables/${later}/download`,
        "GET",
        undefined,
        recipient.cookie,
      )
    ).status,
    402,
  );
  const linked = all[1];
  assert.ok(linked);
  await data(
    await call(
      `/api/invoices/${linked.id}/send`,
      "POST",
      { expectedRevision: linked.revision },
      operator,
    ),
  );
  await data(
    await call(
      `/api/invoices/${linked.id}/settle`,
      "POST",
      { ...receipt, amountReceived: linked.amount },
      operator,
    ),
  );
  assert.equal(
    (
      await call(
        `/api/deliverables/${later}/download`,
        "GET",
        undefined,
        recipient.cookie,
      )
    ).status,
    200,
  );
  const cancelled = all[2];
  assert.ok(cancelled);
  await data(
    await call(`/api/invoices/${cancelled.id}/cancel`, "POST", {}, operator),
  );
  await data(
    await call(`/api/invoices/${cancelled.id}`, "DELETE", {}, operator),
  );
  await data(
    await call(
      "/api/invoices/defaults",
      "PATCH",
      { invoicePrefix: "INV", invoiceNextNumber: 1, paymentInstructions: "" },
      operator,
    ),
    409,
  );
  const prefix = `H${randomUUID().slice(0, 5).toUpperCase()}`;
  await data(
    await call(
      "/api/invoices/defaults",
      "PATCH",
      {
        invoicePrefix: prefix,
        invoiceNextNumber: 50,
        paymentInstructions: "Bank transfer, invoice number as reference",
      },
      operator,
    ),
  );
  assert.equal((await draft()).number, `${prefix}-050`);
  await data(await call("/api/invoices", "GET", undefined, operator));
  await data(
    await call(
      "/api/invoices?status=settled",
      "GET",
      undefined,
      recipient.cookie,
    ),
  );
  assert.equal(
    (
      await fetch(origin + `/dashboard/invoices/${sent.id}`, {
        headers: { cookie: operator },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(origin + `/portal/invoices/${sent.id}`, {
        headers: { cookie: recipient.cookie },
      })
    ).status,
    200,
  );
  const stored =
    await getSql()`select status,amount,settlement_data from invoices where id=${sent.id}`;
  assert.equal(stored[0]?.status, "settled");
  assert.equal(stored[0]?.amount, 12000);
  process.stdout.write(
    "Installed invoices: concurrent numbers, reviewed drafts/freeze, identity/association denial, exact settlement, all versions/any-linked/no-links/new-upload/relock/replay, terminal deletion, defaults and role pages passed.\n",
  );
} finally {
  await getSql().end({ timeout: 5 });
}
