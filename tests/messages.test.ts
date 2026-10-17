import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { getSql } from "../src/lib/db/client";
import { getBranding } from "../src/lib/settings";
import { completeSetup, isSetupComplete } from "../src/lib/setup/service";
import { loginOperator } from "../src/lib/auth/login";
import { saveClient, archiveClient } from "../src/lib/clients/service";
import { issueMagicLink, redeemMagicLink } from "../src/lib/auth/client";
import { saveProject } from "../src/lib/projects/service";
import type { ProjectActor } from "../src/lib/projects/access";
import {
  conversationAccess,
  type Conversation,
} from "../src/lib/messages/access";
import {
  listMessages,
  messageRows,
  messageSummary,
} from "../src/lib/messages/queries";
import {
  sendMessage,
  markMessagesRead,
  downloadAttachment,
} from "../src/lib/messages/service";
import { attachmentType, readMessageUpload } from "../src/lib/storage/upload";
import {
  getFile,
  putFile,
  removeFailedFiles,
  verifyStorage,
} from "../src/lib/storage/adapter";
import { readConfiguration } from "../src/lib/config";
import { subscribeProjects, publishConversation } from "../src/lib/events/hub";
import { projectStream } from "../src/lib/events/stream";
import {
  GET as clientGet,
  POST as clientPost,
} from "../src/app/api/clients/[id]/messages/route";
import {
  GET as projectGet,
  POST as projectPost,
} from "../src/app/api/projects/[id]/messages/route";
import { GET as summaryGet } from "../src/app/api/messages/route";
import { POST as readPost } from "../src/app/api/messages/read/route";
import { GET as downloadGet } from "../src/app/api/messages/[id]/attachments/[attachmentId]/download/route";

let operator: ProjectActor,
  primary: ProjectActor,
  member: ProjectActor,
  outsider: ProjectActor;
let general: Conversation, project: Conversation;
let token: string, clientToken: string;
const origin = process.env.APP_ORIGIN ?? "http://localhost:3022";
const bytes = "Real private attachment\n";
function request(
  body: string,
  files: { filename: string; body: Blob }[] = [],
  id = randomUUID(),
  credential = token,
): Request {
  const form = new FormData();
  form.set("body", body);
  form.set("requestId", id);
  for (const file of files) form.append("files", file.body, file.filename);
  return new Request(`${origin}/api/messages`, {
    method: "POST",
    headers: { origin, cookie: `pylon_session=${credential}` },
    body: form,
  });
}
function json(input: unknown, credential = token): Request {
  return new Request(`${origin}/api/messages/read`, {
    method: "POST",
    headers: {
      origin,
      cookie: `pylon_session=${credential}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}
const context = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});
async function send(
  conversation: Conversation,
  body: string,
  actor = operator,
  files: { filename: string; body: Blob }[] = [],
  id = randomUUID(),
): ReturnType<typeof sendMessage> {
  return sendMessage(
    conversation,
    await readMessageUpload(request(body, files, id)),
    actor,
  );
}

beforeAll(async () => {
  if (!(await isSetupComplete()))
    await completeSetup({
      name: "Remote Operator",
      email: "operator@example.test",
      password: "remote-proof-password-12!",
      brandName: "Remote Studio",
      brandColour: "#315e9e",
      defaultCurrency: "EUR",
      welcomeText: "A private place for our work together.",
    });
  const login = await loginOperator({
    email: "operator@example.test",
    password: "remote-proof-password-12!",
  });
  await getBranding();
  operator = login.user;
  token = login.session.token;
  const actors = await Promise.all(
    ["Message primary", "Message member", "Message outside"].map(
      async (name): Promise<ProjectActor> => ({
        ...(await saveClient(
          { name, email: `${randomUUID()}@example.test` },
          login.user,
        )),
        role: "client",
      }),
    ),
  );
  const [p, m, o] = actors;
  if (!p || !m || !o) throw new TypeError("Missing fixture actors");
  primary = p;
  member = m;
  outsider = o;
  general = { kind: "client", id: primary.id };
  project = {
    kind: "project",
    id: (
      await saveProject(
        {
          name: "Message proof",
          currency: "GBP",
          clientIds: [primary.id, member.id],
        },
        operator,
      )
    ).id,
  };
  clientToken = (
    await redeemMagicLink({
      token: (await issueMagicLink(primary.id, operator)).token,
    })
  ).token;
});
afterAll(async () => {
  await getSql().end();
});

describe("actual conversation writers, bounded files and current authorization", () => {
  it("stages validated real files and removes only owned temporary files", async () => {
    expect(await verifyStorage()).toBe("local");
    expect(attachmentType("notes.txt", "text/plain")).toBe("text/plain");
    for (const filename of [
      "../secret.txt",
      "foo\\secret.txt",
      "run.exe",
      "run.exe.txt",
      "file.html",
      ".hidden.txt",
    ])
      expect(() => attachmentType(filename, "text/plain")).toThrow();
    expect(() => attachmentType("fake.png", "text/plain")).toThrow();
    const upload = await readMessageUpload(
      request("Files", [
        {
          filename: "notes.txt",
          body: new Blob([bytes], { type: "text/plain" }),
        },
      ]),
    );
    const staged = upload.files[0];
    if (!staged) throw new TypeError("Missing staged file");
    expect((await readFile(staged.path)).toString()).toBe(bytes);
    const file = {
      key: `messages/${randomUUID()}/${randomUUID()}`,
      driver: "local" as const,
      size: staged.size,
      mimeType: staged.mimeType,
    };
    await putFile(file, staged.path);
    expect(await new Response(await getFile(file)).text()).toBe(bytes);
    await removeFailedFiles([file]);
    await expect(getFile(file)).rejects.toMatchObject({ statusCode: 503 });
    await upload.cleanup();
    await expect(stat(staged.path)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      putFile({ ...file, key: "../escape" }, staged.path),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("rejects count, size, type, malformed, empty and cross-origin uploads", async () => {
    const text = (data: string): Blob =>
      new Blob([data], { type: "text/plain" });
    await expect(readMessageUpload(request("", []))).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      readMessageUpload(
        request("", [{ filename: "empty.txt", body: text("") }]),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      readMessageUpload(
        request("", [
          {
            filename: "fake.pdf",
            body: new Blob(["fake"], { type: "application/pdf" }),
          },
        ]),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      readMessageUpload(
        request(
          "",
          Array.from({ length: 6 }, () => ({
            filename: "file.txt",
            body: text(bytes),
          })),
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      readMessageUpload(
        request("", [
          { filename: "large.txt", body: text("x".repeat(1048577)) },
        ]),
      ),
    ).rejects.toMatchObject({ statusCode: 413 });
    const boundary = await readMessageUpload(
      request("Exact size", [
        { filename: "exact.txt", body: text("x".repeat(1048576)) },
      ]),
    );
    expect(boundary.files[0]?.size).toBe(1048576);
    await boundary.cleanup();
    const cross = request("cross");
    cross.headers.set("origin", "https://foreign.example");
    await expect(readMessageUpload(cross)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(readMessageUpload(json({}))).rejects.toMatchObject({
      statusCode: 415,
    });
    const invalid = request("bad");
    invalid.headers.set("content-type", "multipart/form-data; boundary=wrong");
    await expect(readMessageUpload(invalid)).rejects.toMatchObject({
      statusCode: 400,
    });
    const missing = request("Missing boundary");
    missing.headers.set("content-type", "multipart/form-data;");
    await expect(readMessageUpload(missing)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it("serializes duplicate sends and stores real private attachment metadata/bytes", async () => {
    const id = randomUUID();
    const pages = await Promise.all([
      send(
        general,
        "Hello client",
        operator,
        [
          {
            filename: "notes.txt",
            body: new Blob([bytes], { type: "text/plain" }),
          },
        ],
        id,
      ),
      send(
        general,
        "Hello client",
        operator,
        [
          {
            filename: "notes.txt",
            body: new Blob([bytes], { type: "text/plain" }),
          },
        ],
        id,
      ),
    ]);
    expect(
      pages[0]?.messages.filter((message) => message.id === id),
    ).toHaveLength(1);
    expect(await getSql()`select id from messages where id=${id}`).toHaveLength(
      1,
    );
    expect(
      await getSql()`select id from message_attachments where message_id=${id}`,
    ).toHaveLength(1);
    const invalidations: string[] = [];
    const unsubscribe = subscribeProjects((change) => {
      if (change.clientId) invalidations.push(change.clientId);
    });
    await send(
      general,
      "Hello client",
      operator,
      [
        {
          filename: "notes.txt",
          body: new Blob([bytes], { type: "text/plain" }),
        },
      ],
      id,
    );
    unsubscribe();
    expect(invalidations).toEqual([primary.id]);
    expect(
      await getSql()`select id from activity_events where client_id=${primary.id} and event_type='message.sent'`,
    ).toHaveLength(1);
    const file = pages[0]?.messages.find((message) => message.id === id)
      ?.attachments[0];
    if (!file) throw new TypeError("Missing stored attachment");
    const response = await downloadAttachment(id, file.id, primary);
    expect(await response.text()).toBe(bytes);
    expect(response.headers.get("content-disposition")).toContain(
      "attachment;",
    );
    await expect(
      downloadAttachment(id, file.id, outsider),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      downloadAttachment(randomUUID(), file.id, primary),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      send(general, "Changed", operator, [], id),
    ).rejects.toMatchObject({ statusCode: 409 });
    await send(general, "Reply to operator", primary);
    expect(
      (await listMessages(general, operator)).messages.map(
        (message) => message.senderName,
      ),
    ).toContain("Message primary");
  });
  it("persists explicit seen-message receipts without marking racing or unloaded messages read", async () => {
    const before = await messageSummary(primary);
    expect(before.total).toBeGreaterThan(0);
    const seen = (await listMessages(general, primary)).messages
      .filter((message) => !message.read)
      .map((message) => message.id);
    await send(general, "Arrived after the visible page");
    const outcomes = await Promise.all([
      markMessagesRead(general, { ids: seen }, primary),
      markMessagesRead(general, { ids: seen }, primary),
    ]);
    expect(outcomes.reduce((count, outcome) => count + outcome.read, 0)).toBe(
      seen.length,
    );
    const current = await listMessages(general, primary);
    expect(
      current.messages
        .filter((message) => !message.read)
        .map((message) => message.body),
    ).toEqual(["Arrived after the visible page"]);
    expect(
      (await messageRows(getSql(), general, primary)).messages.at(-1)?.read,
    ).toBe(false);
    await expect(
      markMessagesRead(general, { ids: seen }, outsider),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(
      (await messageSummary(outsider)).conversations.some(
        (conversation) => conversation.id === primary.id,
      ),
    ).toBe(false);
  });
  it("loads chronological pages/search/since and shares a project only with current members", async () => {
    for (let index = 0; index < 4; index++)
      await send(project, `Project note ${index}`);
    await send(project, "Member reply", member);
    const latest = await listMessages(project, primary, { limit: 2 });
    expect(latest.hasEarlier).toBe(true);
    expect(latest.messages.map((message) => message.body)).toEqual([
      "Project note 3",
      "Member reply",
    ]);
    const earlier = await listMessages(project, primary, {
      before: latest.messages[0]?.position,
      limit: 2,
    });
    expect(earlier.messages.map((message) => message.body)).toEqual([
      "Project note 1",
      "Project note 2",
    ]);
    expect(
      (await listMessages(project, member, { search: "note 2" })).messages,
    ).toHaveLength(1);
    expect(
      (await listMessages(project, member, { since: "2099-01-01T00:00:00Z" }))
        .messages,
    ).toHaveLength(0);
    await expect(listMessages(project, outsider)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      send(project, "Foreign write", outsider),
    ).rejects.toMatchObject({ statusCode: 404 });
    await conversationAccess(general, primary);
    await expect(
      listMessages(project, primary, { before: "9999999999999999999" }),
    ).rejects.toBeDefined();
    expect(
      (await listMessages(project, primary, { before: "9223372036854775807" }))
        .messages.length,
    ).toBeGreaterThan(0);
  });
  it("rolls messages, metadata and activity back on genuine database failure without publishing", async () => {
    const owner = postgres(process.env.MIGRATION_DATABASE_URL ?? "", {
      ssl: false,
      max: 1,
      onnotice: () => undefined,
    });
    const id = randomUUID();
    const changes: unknown[] = [];
    const unsubscribe = subscribeProjects((change) => changes.push(change));
    try {
      await owner`revoke insert on message_attachments from yinsen_runtime`;
      await expect(
        send(
          general,
          "Rollback",
          operator,
          [
            {
              filename: "rollback.txt",
              body: new Blob([bytes], { type: "text/plain" }),
            },
          ],
          id,
        ),
      ).rejects.toBeDefined();
      expect(
        await getSql()`select id from messages where id=${id}`,
      ).toHaveLength(0);
      expect(changes).toHaveLength(0);
    } finally {
      await owner`grant insert on message_attachments to yinsen_runtime`;
      await owner.end();
      unsubscribe();
    }
  });
  it("extends existing payload-free SSE and enforces current access after removal/archive", async () => {
    const abort = new AbortController();
    const stream = await projectStream(
      new Request(`${origin}/api/events`, {
        headers: { cookie: `pylon_session=${clientToken}` },
        signal: abort.signal,
      }),
      undefined,
      primary.id,
    );
    const reader = stream.body?.getReader();
    if (!reader) throw new TypeError("Missing stream");
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "event: refresh",
    );
    publishConversation(primary.id);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "data: {}",
    );
    await saveProject({ clientIds: [primary.id] }, operator, project.id);
    await expect(listMessages(project, member)).rejects.toMatchObject({
      statusCode: 404,
    });
    await archiveClient(primary.id, { ...operator, role: "operator" }, false);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "event: revoked",
    );
    abort.abort();
    await expect(listMessages(general, primary)).rejects.toMatchObject({
      statusCode: 404,
    });
    await archiveClient(primary.id, { ...operator, role: "operator" }, true);
    clientToken = (
      await redeemMagicLink({
        token: (await issueMagicLink(primary.id, operator)).token,
      })
    ).token;
  });
  it("exercises every installed route adapter with real sessions and ordinary multipart bodies", async () => {
    expect((await clientGet(request(""), context(primary.id))).status).toBe(
      200,
    );
    expect((await projectGet(request(""), context(project.id))).status).toBe(
      200,
    );
    expect(
      (await clientPost(request("API general"), context(primary.id))).status,
    ).toBe(200);
    expect(
      (
        await projectPost(
          request("API project", [], randomUUID(), clientToken),
          context(project.id),
        )
      ).status,
    ).toBe(200);
    const fileMessage = (
      await send(project, "API download", operator, [
        {
          filename: "route.txt",
          body: new Blob([bytes], { type: "text/plain" }),
        },
      ])
    ).messages.at(-1);
    const attachmentId = fileMessage?.attachments[0]?.id;
    if (!fileMessage || !attachmentId)
      throw new TypeError("Missing route fixture");
    const fileContext = {
      params: Promise.resolve({ id: fileMessage.id, attachmentId }),
    };
    expect(await (await downloadGet(request(""), fileContext)).text()).toBe(
      bytes,
    );
    expect(
      (await downloadGet(request("", [], randomUUID(), ""), fileContext))
        .status,
    ).toBe(401);
    expect(
      (await readPost(json({ ...project, ids: [fileMessage.id] }, clientToken)))
        .status,
    ).toBe(200);
    expect((await summaryGet(request(""))).status).toBe(200);
    expect((await summaryGet(request("", [], randomUUID(), ""))).status).toBe(
      401,
    );
    expect(
      (
        await clientGet(
          request("", [], randomUUID(), clientToken),
          context(outsider.id),
        )
      ).status,
    ).toBe(404);
    expect(readConfiguration().storage.driver).toBe("local");
  });
});
