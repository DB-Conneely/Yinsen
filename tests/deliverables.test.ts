import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { getSql } from "../src/lib/db/client";
import { getBranding } from "../src/lib/settings";
import { isSetupComplete, completeSetup } from "../src/lib/setup/service";
import { loginOperator } from "../src/lib/auth/login";
import { issueMagicLink, redeemMagicLink } from "../src/lib/auth/client";
import { saveClient } from "../src/lib/clients/service";
import { saveProject } from "../src/lib/projects/service";
import { getProject } from "../src/lib/projects/queries";
import {
  createMilestone,
  mutateMilestone,
} from "../src/lib/milestones/service";
import { readDeliverableUpload } from "../src/lib/storage/upload";
import {
  listDeliverables,
  milestoneProject,
} from "../src/lib/deliverables/queries";
import {
  uploadDeliverable,
  releaseDeliverable,
  downloadDeliverable,
} from "../src/lib/deliverables/service";
import type { ProjectActor } from "../src/lib/projects/access";
import { POST } from "../src/app/api/milestones/[id]/deliverables/route";
import { PATCH } from "../src/app/api/deliverables/[id]/route";
import { GET } from "../src/app/api/deliverables/[id]/download/route";
import { releaseInput } from "../src/lib/deliverables/validation";

let operator: { id: string; role: "operator" };
let client: ProjectActor, foreign: ProjectActor;
let milestoneId: string, otherMilestone: string, projectId: string;
let token: string, clientToken: string;
const origin = process.env.APP_ORIGIN ?? "http://localhost:3041";
const bytes = "Private milestone delivery\n";
const context = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});
function request(
  id = randomUUID(),
  parent?: string,
  credential = token,
  content = bytes,
): Request {
  const body = new FormData();
  body.set("requestId", id);
  if (parent) body.set("parentDeliverableId", parent);
  body.set("file", new Blob([content], { type: "text/plain" }), "delivery.txt");
  return new Request(origin + "/api/upload", {
    method: "POST",
    headers: { origin, cookie: `pylon_session=${credential}` },
    body,
  });
}
function json(released: boolean, credential = token): Request {
  return new Request(origin + "/api/release", {
    method: "PATCH",
    headers: {
      origin,
      cookie: `pylon_session=${credential}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ released }),
  });
}
async function send(
  id = randomUUID(),
  parent?: string,
): ReturnType<typeof uploadDeliverable> {
  return uploadDeliverable(
    milestoneId,
    await readDeliverableUpload(request(id, parent)),
    operator,
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
  operator = login.user;
  token = login.session.token;
  await getBranding();
  client = {
    ...(await saveClient(
      { name: "Delivery client", email: `${randomUUID()}@example.test` },
      operator,
    )),
    role: "client",
  };
  foreign = {
    ...(await saveClient(
      { name: "Delivery outsider", email: `${randomUUID()}@example.test` },
      operator,
    )),
    role: "client",
  };
  clientToken = (
    await redeemMagicLink({
      token: (await issueMagicLink(client.id, operator)).token,
    })
  ).token;
  const project = await saveProject(
    { name: "Deliverable proof", currency: "GBP", clientIds: [client.id] },
    operator,
  );
  projectId = project.id;
  milestoneId =
    (await createMilestone(projectId, { name: "Design" }, operator))
      .milestones[0]?.id ?? "";
  const other = await saveProject(
    {
      name: "Other delivery project",
      currency: "GBP",
      clientIds: [foreign.id],
    },
    operator,
  );
  otherMilestone =
    (await createMilestone(other.id, { name: "Other" }, operator)).milestones[0]
      ?.id ?? "";
});
afterAll(async () => {
  await getSql().end();
});

describe("wired milestone deliverables and private per-version release", () => {
  it("reuses bounded streaming validation and rejects malformed/oversized or forged uploads", async () => {
    const upload = await readDeliverableUpload(request());
    const file = upload.files[0];
    if (!file) throw new TypeError("Missing staged file");
    expect((await readFile(file.path)).toString()).toBe(bytes);
    await upload.cleanup();
    await expect(stat(file.path)).rejects.toMatchObject({ code: "ENOENT" });
    const cross = request();
    cross.headers.set("origin", "https://foreign.example");
    await expect(readDeliverableUpload(cross)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      readDeliverableUpload(
        request(randomUUID(), undefined, token, "x".repeat(1048577)),
      ),
    ).rejects.toMatchObject({ statusCode: 413 });
    const duplicate = new FormData();
    duplicate.set("requestId", randomUUID());
    duplicate.append(
      "file",
      new Blob([bytes], { type: "text/plain" }),
      "one.txt",
    );
    duplicate.append(
      "file",
      new Blob([bytes], { type: "text/plain" }),
      "two.txt",
    );
    await expect(
      readDeliverableUpload(
        new Request(origin, {
          method: "POST",
          headers: { origin },
          body: duplicate,
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(releaseInput.safeParse({ released: "true" }).success).toBe(false);
    expect(
      releaseInput.safeParse({ released: true, extra: true }).success,
    ).toBe(false);
    await expect(milestoneProject(randomUUID())).rejects.toMatchObject({
      statusCode: 404,
    });
  });
  it("persists private bytes once across replay/races and enforces each version independently", async () => {
    const id = randomUUID();
    const results = await Promise.all([send(id), send(id)]);
    expect(results.map((item) => item.id)).toEqual([id, id]);
    expect(await milestoneProject(milestoneId)).toBe(projectId);
    expect(
      (await listDeliverables(projectId, client)).filter(
        (item) => item.id === id,
      ),
    ).toHaveLength(1);
    expect(await (await downloadDeliverable(id, operator)).text()).toBe(bytes);
    await expect(downloadDeliverable(id, client)).rejects.toMatchObject({
      statusCode: 402,
    });
    await expect(downloadDeliverable(id, foreign)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      releaseDeliverable(id, { released: true }, client),
    ).rejects.toMatchObject({ statusCode: 403 });
    await releaseDeliverable(id, { released: true }, operator);
    await releaseDeliverable(id, { released: true }, operator);
    expect(await (await downloadDeliverable(id, client)).text()).toBe(bytes);
    const versions = await Promise.all([
      send(randomUUID(), id),
      send(randomUUID(), id),
    ]);
    expect(versions.map((item) => item.version).sort()).toEqual([2, 3]);
    for (const file of versions) {
      expect(file.released).toBe(false);
      await expect(downloadDeliverable(file.id, client)).rejects.toMatchObject({
        statusCode: 402,
      });
    }
    const next = await send(randomUUID(), versions[0]?.id);
    expect(next.parentDeliverableId).toBe(id);
    expect(next.version).toBe(4);
    await releaseDeliverable(next.id, { released: true }, operator);
    await releaseDeliverable(id, { released: false }, operator);
    await expect(downloadDeliverable(id, client)).rejects.toMatchObject({
      statusCode: 402,
    });
    expect(await (await downloadDeliverable(next.id, client)).text()).toBe(
      bytes,
    );
    expect((await send(id)).released).toBe(false);
    expect(
      await getSql()`select id from project_activity where project_id=${projectId} and event_type='deliverable.uploaded'`,
    ).toHaveLength(4);
    await expect(
      uploadDeliverable(
        milestoneId,
        await readDeliverableUpload(request(id, undefined, token, "changed")),
        operator,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      uploadDeliverable(
        otherMilestone,
        await readDeliverableUpload(request(randomUUID(), id)),
        operator,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(send(randomUUID(), randomUUID())).rejects.toMatchObject({
      statusCode: 404,
    });
  });
  it("rolls back a real post-Put SQL failure, removes only that private object and retries once", async () => {
    const owner = postgres(process.env.MIGRATION_DATABASE_URL ?? "", {
      max: 1,
      ssl: false,
      onnotice: () => undefined,
    });
    const id = randomUUID();
    try {
      await owner`revoke insert on deliverables from yinsen_runtime`;
      await expect(send(id)).rejects.toBeDefined();
      expect(
        await getSql()`select id from deliverables where id=${id}`,
      ).toHaveLength(0);
    } finally {
      await owner`grant insert on deliverables to yinsen_runtime`;
      await owner.end();
    }
    expect((await send(id)).id).toBe(id);
    expect(
      await getSql()`select id from deliverables where id=${id}`,
    ).toHaveLength(1);
  });
  it("exercises every real route adapter with current sessions, origin checks and membership revocation", async () => {
    const id = randomUUID();
    expect((await POST(request(id), context(milestoneId))).status).toBe(200);
    expect(
      (
        await POST(
          request(randomUUID(), undefined, clientToken),
          context(milestoneId),
        )
      ).status,
    ).toBe(403);
    expect((await GET(request(id, undefined, ""), context(id))).status).toBe(
      401,
    );
    expect(
      (await GET(request(id, undefined, clientToken), context(id))).status,
    ).toBe(402);
    expect((await PATCH(json(true), context(id))).status).toBe(200);
    const download = await GET(
      request(id, undefined, clientToken),
      context(id),
    );
    expect(download.status).toBe(200);
    expect(await download.text()).toBe(bytes);
    expect(download.headers.get("content-disposition")).toContain(
      "attachment;",
    );
    const cross = json(false);
    cross.headers.set("origin", "https://foreign.example");
    expect((await PATCH(cross, context(id))).status).toBe(403);
    expect((await PATCH(json(false), context(id))).status).toBe(200);
    expect(
      (await GET(request(id, undefined, clientToken), context(id))).status,
    ).toBe(402);
    await saveProject(
      {
        clientIds: [foreign.id],
        expectedRevision: (await getProject(projectId, operator)).editRevision,
      },
      operator,
      projectId,
    );
    expect(
      (await GET(request(id, undefined, clientToken), context(id))).status,
    ).toBe(404);
    await expect(listDeliverables(projectId, client)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
  it("preserves existing milestone deletion with committed cascade and private byte cleanup", async () => {
    const file = await send();
    const rows = await getSql()<
      { key: string }[]
    >`select storage_key as key from deliverables where id=${file.id}`;
    await mutateMilestone(milestoneId, {}, operator, "delete");
    expect(
      await getSql()`select id from deliverables where milestone_id=${milestoneId}`,
    ).toHaveLength(0);
    await expect(
      stat(
        `${process.env.STORAGE_LOCAL_PATH ?? ""}/${rows[0]?.key ?? "missing"}`,
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
