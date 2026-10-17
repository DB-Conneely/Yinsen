import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../src/lib/db/client";
import { completeSetup, isSetupComplete } from "../src/lib/setup/service";
import { getBranding } from "../src/lib/settings";
import { saveClient, archiveClient } from "../src/lib/clients/service";
import {
  saveProject,
  transitionProject,
  deleteProject,
  projectMemberIds,
} from "../src/lib/projects/service";
import {
  getProject,
  listProjects,
  type ProjectDetail,
} from "../src/lib/projects/queries";
import {
  projectActor,
  projectAccess,
  operatorOnly,
  type ProjectActor,
} from "../src/lib/projects/access";
import {
  resourceId,
  projectFields,
  projectStatus,
  milestoneFields,
  milestoneStatus,
} from "../src/lib/projects/validation";
import {
  createMilestone,
  mutateMilestone,
} from "../src/lib/milestones/service";
import { subscribeProjects, publishProject } from "../src/lib/events/hub";
import { projectStream } from "../src/lib/events/stream";
import {
  issueMagicLink,
  redeemMagicLink,
  destroyClientSession,
} from "../src/lib/auth/client";
import { loginOperator } from "../src/lib/auth/login";
import { GET, POST } from "../src/app/api/projects/route";
import {
  GET as detailGet,
  PATCH,
  DELETE,
} from "../src/app/api/projects/[id]/route";
import { POST as lockIn } from "../src/app/api/projects/[id]/lock-in/route";
import {
  GET as milestoneGet,
  POST as milestonePost,
} from "../src/app/api/projects/[id]/milestones/route";
import {
  PATCH as milestonePatch,
  DELETE as milestoneDelete,
} from "../src/app/api/milestones/[id]/route";
import { POST as approvePost } from "../src/app/api/milestones/[id]/approve/route";
import { GET as eventGet } from "../src/app/api/events/route";

let operator: ProjectActor;
let primary: ProjectActor;
let member: ProjectActor;
let outsider: ProjectActor;
let project: ProjectDetail;
let token: string;
const origin = process.env.APP_ORIGIN ?? "http://localhost:3021";
const fields = {
  name: "A shared workspace",
  currency: "GBP",
  budget: 12345,
  description: "Agreed scope",
};
const context = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});
function request(
  path: string,
  body: unknown = {},
  credential = token,
): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      cookie: `pylon_session=${credential}`,
    },
    body: JSON.stringify(body),
  });
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
  await getBranding();
  const login = await loginOperator({
    email: "operator@example.test",
    password: "remote-proof-password-12!",
  });
  token = login.session.token;
  operator = login.user;
  const clients = await Promise.all(
    ["Primary", "Member", "Outside"].map((name) =>
      saveClient({ name, email: `${randomUUID()}@example.test` }, login.user),
    ),
  );
  const actors = clients.map((client): ProjectActor => ({
    id: client.id,
    role: "client",
  }));
  const [p, m, o] = actors;
  if (!p || !m || !o) throw new TypeError("Missing synthetic identities");
  primary = p;
  member = m;
  outsider = o;
  project = await saveProject(
    { ...fields, clientIds: [primary.id, member.id] },
    operator,
  );
});
afterAll(async () => {
  await getSql().end();
});

describe("installed project and milestone writers on real PostgreSQL", () => {
  it("validates identifiers, amounts, dates, duplicates and known statuses", async () => {
    expect(resourceId.safeParse("foreign").success).toBe(false);
    expect(projectStatus.safeParse("completed").success).toBe(false);
    expect(milestoneStatus.parse("review")).toBe("review");
    expect(milestoneFields.safeParse({ name: "" }).success).toBe(false);
    expect(
      projectFields.safeParse({
        ...fields,
        budget: 1.5,
        clientIds: [primary.id],
      }).success,
    ).toBe(false);
    await expect(
      saveProject({ ...fields, clientIds: [primary.id, primary.id] }, operator),
    ).rejects.toBeDefined();
    await expect(
      saveProject(
        {
          ...fields,
          startDate: "2026-10-20",
          dueDate: "2026-10-19",
          clientIds: [primary.id],
        },
        operator,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("persists primary/member, updates without clearing omitted fields and scopes lists/detail", async () => {
    expect(project.members.find((item) => item.id === primary.id)?.role).toBe(
      "primary",
    );
    expect(await projectMemberIds(getSql(), project.id)).toEqual(
      expect.arrayContaining([primary.id, member.id]),
    );
    expect((await listProjects(member)).map((item) => item.id)).toContain(
      project.id,
    );
    expect((await listProjects(outsider)).map((item) => item.id)).not.toContain(
      project.id,
    );
    expect(
      (await listProjects(member, { status: "active" })).map((item) => item.id),
    ).not.toContain(project.id);
    expect(
      (await listProjects(operator, { client_id: primary.id })).map(
        (item) => item.id,
      ),
    ).toContain(project.id);
    await projectAccess(project.id, member);
    await expect(getProject(project.id, outsider)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(getProject(randomUUID(), outsider)).rejects.toMatchObject({
      statusCode: 404,
    });
    const updated = await saveProject(
      { name: "Updated workspace" },
      operator,
      project.id,
    );
    expect(updated.budget).toBe(12345);
    expect(updated.members).toHaveLength(2);
    expect(() => operatorOnly(member)).toThrow();
  });
  it("enforces lock-in roles and linearizes competing client confirmation", async () => {
    await expect(
      transitionProject(project.id, { status: "active" }, operator),
    ).rejects.toMatchObject({ statusCode: 409 });
    await transitionProject(project.id, { status: "pending_lockin" }, operator);
    const results = await Promise.allSettled([
      transitionProject(project.id, { status: "active" }, member),
      transitionProject(project.id, { status: "active" }, primary),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect((await getProject(project.id, operator)).status).toBe("active");
    await transitionProject(project.id, { status: "paused" }, operator);
    await expect(
      transitionProject(project.id, { status: "active" }, member),
    ).rejects.toMatchObject({ statusCode: 409 });
    await transitionProject(project.id, { status: "active" }, operator);
    const facts =
      await getSql()`select id from project_activity where project_id=${project.id} and event_type='project.locked_in'`;
    expect(facts).toHaveLength(1);
  });
  it("creates and reorders concurrent milestones without lost/duplicate positions", async () => {
    await Promise.all([
      createMilestone(project.id, { name: "First" }, operator),
      createMilestone(project.id, { name: "Second" }, operator),
    ]);
    let current = await getProject(project.id, operator);
    expect(current.milestones.map((item) => item.position)).toEqual([0, 1]);
    const last = current.milestones[1];
    if (!last) throw new TypeError("Missing milestone");
    await mutateMilestone(
      last.id,
      { position: 0, description: "Reordered" },
      operator,
      "update",
    );
    current = await getProject(project.id, operator);
    expect(current.milestones[0]?.id).toBe(last.id);
    expect(current.milestones.map((item) => item.position)).toEqual([0, 1]);
    await expect(
      mutateMilestone(
        last.id,
        { position: 20, name: "Must roll back" },
        operator,
        "update",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect((await getProject(project.id, operator)).milestones[0]?.name).toBe(
      last.name,
    );
  });
  it("requires review and the primary client for exactly one approval", async () => {
    const milestone = (await getProject(project.id, operator)).milestones[0];
    if (!milestone) throw new TypeError("Missing milestone");
    await expect(
      mutateMilestone(milestone.id, {}, primary, "approve"),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      mutateMilestone(milestone.id, { status: "review" }, operator, "update"),
    ).rejects.toMatchObject({ statusCode: 409 });
    await mutateMilestone(
      milestone.id,
      { status: "in_progress" },
      operator,
      "update",
    );
    await mutateMilestone(
      milestone.id,
      { status: "review" },
      operator,
      "update",
    );
    await expect(
      mutateMilestone(milestone.id, {}, member, "approve"),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      mutateMilestone(milestone.id, {}, operator, "approve"),
    ).rejects.toMatchObject({ statusCode: 403 });
    const results = await Promise.allSettled([
      mutateMilestone(milestone.id, {}, primary, "approve"),
      mutateMilestone(milestone.id, {}, primary, "approve"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const reordered = await mutateMilestone(
      milestone.id,
      { position: 1, name: "Approved work" },
      operator,
      "update",
    );
    expect(
      reordered.milestones.find((item) => item.id === milestone.id),
    ).toMatchObject({ status: "approved", position: 1, name: "Approved work" });
    await expect(
      mutateMilestone(milestone.id, { status: "review" }, operator, "update"),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      mutateMilestone(milestone.id, {}, outsider, "approve"),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Project not found.",
    });
    await expect(
      mutateMilestone(randomUUID(), {}, outsider, "approve"),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Project not found.",
    });
  });
  it("rolls membership changes back on an archived/unknown client and keeps one primary", async () => {
    await archiveClient(outsider.id, { ...operator, role: "operator" }, false);
    await expect(
      saveProject(
        { clientIds: [primary.id, outsider.id] },
        operator,
        project.id,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect((await getProject(project.id, operator)).members).toHaveLength(2);
    await expect(
      getSql()`insert into project_clients(project_id,client_id,role) values (${project.id},${outsider.id},'primary')`,
    ).rejects.toMatchObject({ code: "23505" });
  });
  it("publishes only committed changes and unsubscribes the real hub", async () => {
    const changes: string[] = [];
    const unsubscribe = subscribeProjects((change) => {
      if (change.projectId) changes.push(change.projectId);
    });
    await expect(
      saveProject({ clientIds: [randomUUID()] }, operator, project.id),
    ).rejects.toBeDefined();
    expect(changes).toEqual([]);
    await saveProject({ description: "Current truth" }, operator, project.id);
    expect(changes).toEqual([project.id]);
    unsubscribe();
    publishProject(project.id, []);
    expect(changes).toHaveLength(1);
  });
  it("rechecks live stream scope after membership removal and archived session denial", async () => {
    const link = await issueMagicLink(member.id, operator);
    const session = await redeemMagicLink({ token: link.token });
    expect(await projectActor(session.token)).toEqual(
      expect.objectContaining(member),
    );
    expect(await projectActor(token)).toEqual(
      expect.objectContaining(operator),
    );
    await expect(projectActor(undefined)).rejects.toMatchObject({
      statusCode: 401,
    });
    const abort = new AbortController();
    const stream = await projectStream(
      new Request(`${origin}/api/events`, {
        headers: { cookie: `pylon_session=${session.token}` },
        signal: abort.signal,
      }),
      project.id,
    );
    const reader = stream.body?.getReader();
    if (!reader) throw new TypeError("Missing event stream");
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "event: refresh",
    );
    await saveProject({ clientIds: [primary.id] }, operator, project.id);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "event: revoked",
    );
    expect((await reader.read()).done).toBe(true);
    abort.abort();
    await expect(getProject(project.id, member)).rejects.toMatchObject({
      statusCode: 404,
    });
    await destroyClientSession(session.token);
    await expect(projectActor(session.token)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
  it("exercises the ordinary route adapters and keeps API denial/cache contracts", async () => {
    expect((await GET(request("/api/projects"))).status).toBe(200);
    expect((await GET(request("/api/projects", {}, ""))).status).toBe(401);
    const created = await POST(
      request("/api/projects", { ...fields, clientIds: [primary.id] }),
    );
    expect(created.status).toBe(200);
    const result: unknown = await created.json();
    const parsed = (await import("zod")).z
      .object({ data: (await import("zod")).z.object({ id: resourceId }) })
      .parse(result);
    const id = parsed.data.id;
    expect(
      (await detailGet(request("/"), context(id))).headers.get("cache-control"),
    ).toContain("no-store");
    expect(
      (await PATCH(request("/", { status: "pending_lockin" }), context(id)))
        .status,
    ).toBe(200);
    expect((await lockIn(request("/"), context(id))).status).toBe(403);
    expect(
      (await milestonePost(request("/", { name: "HTTP caller" }), context(id)))
        .status,
    ).toBe(200);
    expect((await milestoneGet(request("/"), context(id))).status).toBe(200);
    const m = (await getProject(id, operator)).milestones[0];
    if (!m) throw new TypeError("Missing route milestone");
    expect(
      (await milestonePatch(request("/", { name: "Updated" }), context(m.id)))
        .status,
    ).toBe(200);
    expect((await approvePost(request("/"), context(m.id))).status).toBe(403);
    expect((await milestoneDelete(request("/"), context(m.id))).status).toBe(
      200,
    );
    expect((await eventGet(request("/api/events", {}, ""))).status).toBe(401);
    expect((await DELETE(request("/"), context(id))).status).toBe(200);
    await expect(getProject(id, operator)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await deleteProject(project.id, operator)).toEqual({
      deleted: true,
    });
  });
});
