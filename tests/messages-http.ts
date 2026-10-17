import "./fixture";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { z } from "zod";
import { readConfiguration } from "../src/lib/config";

const origin = process.env.TEST_BASE_URL ?? readConfiguration().origin;
const envelope = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string() }).nullable(),
});
const idSchema = z.object({ id: z.uuid() });
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
): Promise<Response> {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      origin,
      ...(token ? { cookie: token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function data(response: Response, status = 200): Promise<unknown> {
  const value = envelope.parse(await response.json());
  assert.equal(response.status, status, JSON.stringify(value));
  return value.data;
}
async function send(
  path: string,
  cookie: string,
  body: string,
  files: { name: string; bytes: Uint8Array }[] = [],
  id = randomUUID(),
): Promise<Response> {
  const form = new FormData();
  form.set("body", body);
  form.set("requestId", id);
  for (const file of files)
    form.append(
      "files",
      new Blob([Uint8Array.from(file.bytes)], { type: "text/plain" }),
      file.name,
    );
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: { origin, cookie },
    body: form,
  });
}

const login = await call("/api/auth/login", "POST", {
  email: "operator@example.test",
  password: "remote-proof-password-12!",
});
await data(login);
const operator = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(operator);
const clients = [];
for (const name of ["HTTP message primary", "HTTP message outside"])
  clients.push(
    idSchema.parse(
      await data(
        await call(
          "/api/clients",
          "POST",
          { name, email: `${randomUUID()}@example.test` },
          operator,
        ),
      ),
    ),
  );
const [primary, outside] = clients;
assert.ok(primary && outside);
async function clientCookie(id: string): Promise<string> {
  const link = z
    .object({ url: z.url() })
    .parse(
      await data(
        await call(`/api/clients/${id}/generate-link`, "POST", {}, operator),
      ),
    );
  const response = await call("/api/auth/verify", "POST", {
    token: new URL(link.url).hash.slice(1),
  });
  await data(response);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}
const client = await clientCookie(primary.id),
  foreign = await clientCookie(outside.id);
const project = idSchema.parse(
  await data(
    await call(
      "/api/projects",
      "POST",
      { name: "HTTP message work", currency: "GBP", clientIds: [primary.id] },
      operator,
    ),
  ),
);
const generalPath = `/api/clients/${primary.id}/messages`,
  projectPath = `/api/projects/${project.id}/messages`;
const page = z.object({
  messages: z.array(
    z.object({
      id: z.uuid(),
      position: z.string(),
      body: z.string(),
      read: z.boolean(),
      attachments: z.array(
        z.object({ id: z.uuid(), sha256: z.string(), size: z.number() }),
      ),
    }),
  ),
  hasEarlier: z.boolean(),
});
const bytes = new TextEncoder().encode("Ordinary HTTP attachment bytes\n");
const first = page
  .parse(
    await data(
      await send(generalPath, operator, "HTTP general", [
        { name: "ordinary.txt", bytes },
      ]),
    ),
  )
  .messages.at(-1);
assert.ok(first?.attachments[0]);
const file = first.attachments[0];
const downloadPath = `/api/messages/${first.id}/attachments/${file.id}/download`;
const download = await call(downloadPath, "GET", undefined, client);
assert.equal(download.status, 200);
assert.equal(download.headers.get("x-content-type-options"), "nosniff");
assert.match(download.headers.get("cache-control") ?? "", /no-store/);
assert.equal(
  createHash("sha256")
    .update(new Uint8Array(await download.arrayBuffer()))
    .digest("hex"),
  file.sha256,
);
await data(await call(downloadPath), 401);
await data(await call(downloadPath, "GET", undefined, foreign), 404);
await data(
  await call(
    `/api/messages/${randomUUID()}/attachments/${file.id}/download`,
    "GET",
    undefined,
    client,
  ),
  404,
);
await data(await call(generalPath, "GET", undefined, foreign), 404);
await data(await send(generalPath, foreign, "Denied"), 404);
const unique = randomUUID();
await Promise.all([
  send(projectPath, operator, "Idempotent", [], unique).then((response) =>
    data(response),
  ),
  send(projectPath, operator, "Idempotent", [], unique).then((response) =>
    data(response),
  ),
]);
assert.equal(
  page
    .parse(await data(await call(projectPath, "GET", undefined, client)))
    .messages.filter((message) => message.id === unique).length,
  1,
);
await data(await send(projectPath, operator, "Changed", [], unique), 409);
await data(
  await send(projectPath, client, "HTTP project reply", [
    { name: "reply.txt", bytes },
  ]),
);
const latest = page.parse(
  await data(await call(`${projectPath}?limit=1`, "GET", undefined, client)),
);
assert.equal(latest.hasEarlier, true);
assert.equal(latest.messages[0]?.body, "HTTP project reply");
assert.equal(
  page.parse(
    await data(
      await call(
        `${projectPath}?before=${latest.messages[0]?.position}&limit=1`,
        "GET",
        undefined,
        client,
      ),
    ),
  ).messages[0]?.id,
  unique,
);
assert.equal(
  page.parse(
    await data(
      await call(`${projectPath}?search=Idempotent`, "GET", undefined, client),
    ),
  ).messages.length,
  1,
);
assert.equal(
  page.parse(
    await data(
      await call(
        `${projectPath}?since=2099-01-01T00:00:00Z`,
        "GET",
        undefined,
        client,
      ),
    ),
  ).messages.length,
  0,
);
await data(
  await call(
    `${projectPath}?before=9999999999999999999`,
    "GET",
    undefined,
    client,
  ),
  400,
);
await data(
  await call(`${projectPath}?before=abc`, "GET", undefined, client),
  400,
);
await data(
  await call(
    `${projectPath}?before=9223372036854775807`,
    "GET",
    undefined,
    client,
  ),
);
const seen = page
  .parse(await data(await call(projectPath, "GET", undefined, client)))
  .messages.filter((message) => !message.read)
  .map((message) => message.id);
await data(await send(projectPath, operator, "Race after read snapshot"));
await Promise.all([
  call(
    "/api/messages/read",
    "POST",
    { kind: "project", id: project.id, ids: seen },
    client,
  ).then((response) => data(response)),
  call(
    "/api/messages/read",
    "POST",
    { kind: "project", id: project.id, ids: seen },
    client,
  ).then((response) => data(response)),
]);
assert.deepEqual(
  page
    .parse(await data(await call(projectPath, "GET", undefined, client)))
    .messages.filter((message) => !message.read)
    .map((message) => message.body),
  ["Race after read snapshot"],
);
await data(
  await call(
    "/api/messages/read",
    "POST",
    { kind: "project", id: project.id, ids: seen },
    foreign,
  ),
  404,
);
await data(
  await send(projectPath, operator, "Blocked", [
    { name: "bad.exe.txt", bytes },
  ]),
  400,
);
await data(
  await send(
    projectPath,
    operator,
    "Too many",
    Array.from({ length: 6 }, () => ({ name: "ordinary.txt", bytes })),
  ),
  400,
);
const limit = readConfiguration().storage.maxBytes;
await data(
  await fetch(`${origin}${projectPath}`, {
    method: "POST",
    headers: {
      origin,
      cookie: operator,
      "content-type": "multipart/form-data;",
    },
    body: "malformed",
  }),
  400,
);
await data(
  await send(projectPath, operator, "Exact limit", [
    { name: "exact.txt", bytes: new Uint8Array(limit).fill(120) },
  ]),
);
await data(
  await send(projectPath, operator, "Over limit", [
    { name: "over.txt", bytes: new Uint8Array(limit + 1).fill(120) },
  ]),
  413,
);

// No Content-Length: the installed parser must bound the actual chunked bytes.
const boundary = `yinsen-${randomUUID()}`;
const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="requestId"\r\n\r\n${randomUUID()}\r\n--${boundary}\r\nContent-Disposition: form-data; name="body"\r\n\r\nChunked overflow\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="chunked.txt"\r\nContent-Type: text/plain\r\n\r\n`;
const chunked = await new Promise<number>((resolve, reject) => {
  const request = httpRequest(
    `${origin}${projectPath}`,
    {
      method: "POST",
      headers: {
        origin,
        cookie: operator,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Transfer-Encoding": "chunked",
      },
    },
    (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    },
  );
  request.on("error", reject);
  request.write(prefix);
  request.write(Buffer.alloc(limit + 1, 120));
  request.end(`\r\n--${boundary}--\r\n`);
});
assert.equal(chunked, 413);
await data(
  await call(
    `/api/projects/${project.id}`,
    "PATCH",
    {
      clientIds: [outside.id],
      expectedRevision: z
        .object({ editRevision: z.string() })
        .parse(
          await data(
            await call(
              `/api/projects/${project.id}`,
              "GET",
              undefined,
              operator,
            ),
          ),
        ).editRevision,
    },
    operator,
  ),
);
await data(await call(projectPath, "GET", undefined, client), 404);
await data(await call(`/api/clients/${primary.id}`, "DELETE", {}, operator));
await data(await call(generalPath, "GET", undefined, client), 401);
await data(await call(downloadPath, "GET", undefined, client), 401);
process.stdout.write(
  "Installed message HTTP: actual text/files, bytes, sessions, idempotency, search/pagination, read races, size/count/type/chunked bounds and revocation passed.\n",
);
