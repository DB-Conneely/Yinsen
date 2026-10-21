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
import { sendMessage } from "../src/lib/messages/service";
import { listMessages, messageSummary } from "../src/lib/messages/queries";
import { POST as submitPost } from "../src/app/api/projects/[id]/submit-for-approval/route";
import { POST as acceptPost } from "../src/app/api/projects/[id]/accept/route";
import { POST as disputePost } from "../src/app/api/projects/[id]/dispute/route";
import { POST as archivePost } from "../src/app/api/projects/[id]/archive/route";
import postgres from "postgres";

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

async function editProject(
  input: Record<string, unknown>,
  id = project.id,
): Promise<ProjectDetail> {
  const current = await getProject(id, operator);
  return saveProject(
    { ...input, expectedRevision: current.editRevision },
    operator,
    id,
  );
}

async function activeProject(): Promise<ProjectDetail> {
  const created = await saveProject(
    { ...fields, clientIds: [primary.id, member.id] },
    operator,
  );
  const pending = await transitionProject(
    created.id,
    { status: "pending_lockin" },
    operator,
  );
  return transitionProject(
    created.id,
    { status: "active", expectedRevision: pending.lockRevision },
    primary,
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
    expect(projectStatus.parse("completed")).toBe("completed");
    expect(projectStatus.safeParse("unknown").success).toBe(false);
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
    const updated = await editProject({ name: "Updated workspace" });
    expect(updated.budget).toBe(12345);
    expect(updated.members).toHaveLength(2);
    expect(() => operatorOnly(member)).toThrow();
  });
  it("rejects stale full edits and preserves unrelated fields on deliberate partial retry", async () => {
    const initial = await saveProject(
      { ...fields, clientIds: [primary.id, member.id] },
      operator,
    );
    const newer = await editProject(
      { budget: 990000, clientIds: [primary.id] },
      initial.id,
    );
    await expect(
      saveProject(
        {
          ...fields,
          description: "My retained draft",
          clientIds: [primary.id, member.id],
          expectedRevision: initial.editRevision,
        },
        operator,
        initial.id,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "PROJECT_CHANGED" });
    expect(await getProject(initial.id, operator)).toEqual(newer);
    await expect(
      saveProject({ description: "Missing baseline" }, operator, initial.id),
    ).rejects.toBeDefined();
    const retried = await saveProject(
      {
        description: "My retained draft",
        expectedRevision: newer.editRevision,
      },
      operator,
      initial.id,
    );
    expect(retried).toMatchObject({
      budget: 990000,
      description: "My retained draft",
    });
    expect(retried.members.map((item) => item.id)).toEqual([primary.id]);
    const cleared = await editProject(
      { description: "", budget: null, startDate: null, dueDate: null },
      initial.id,
    );
    expect(cleared).toMatchObject({
      description: "",
      budget: null,
      startDate: null,
      dueDate: null,
    });
  });
  it("binds lock-in to reviewed terms and ordered milestones, ignoring messages", async () => {
    const initial = await saveProject(
      { ...fields, clientIds: [primary.id] },
      operator,
    );
    await createMilestone(
      initial.id,
      { name: "Original", dueDate: "2026-11-01" },
      operator,
    );
    await createMilestone(initial.id, { name: "Second" }, operator);
    let reviewed = await transitionProject(
      initial.id,
      { status: "pending_lockin" },
      operator,
    );
    await sendMessage(
      { kind: "project", id: initial.id },
      {
        requestId: randomUUID(),
        body: "A conversation does not change the terms",
        files: [],
        cleanup: () => Promise.resolve(),
      },
      operator,
    );
    const afterMessage = await getProject(initial.id, primary);
    expect(afterMessage.lockRevision).toBe(reviewed.lockRevision);
    expect(afterMessage.editRevision).toBe(reviewed.editRevision);
    for (const change of [
      { description: "Unseen scope" },
      { budget: 990000 },
      { startDate: "2026-10-01", dueDate: "2026-12-01" },
    ]) {
      const changed = await editProject(change, initial.id);
      await expect(
        transitionProject(
          initial.id,
          { status: "active", expectedRevision: reviewed.lockRevision },
          primary,
        ),
      ).rejects.toMatchObject({ statusCode: 409, code: "PROJECT_CHANGED" });
      expect(await getProject(initial.id, primary)).toEqual(changed);
      reviewed = changed;
    }
    const first = reviewed.milestones[0];
    if (!first) throw new TypeError("Missing reviewed milestone");
    const changed = await mutateMilestone(
      first.id,
      {
        position: 1,
        name: "Unseen milestone",
        description: "New work",
        dueDate: "2026-12-02",
      },
      operator,
      "update",
    );
    await expect(
      transitionProject(
        initial.id,
        { status: "active", expectedRevision: reviewed.lockRevision },
        primary,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await getProject(initial.id, primary)).toEqual(changed);
    expect(
      (
        await transitionProject(
          initial.id,
          { status: "active", expectedRevision: changed.lockRevision },
          primary,
        )
      ).status,
    ).toBe("active");
  });
  it("binds primary approval to milestone content while allowing ordinary approved edits", async () => {
    const initial = await saveProject(
      { ...fields, clientIds: [primary.id] },
      operator,
    );
    const created = await createMilestone(
      initial.id,
      { name: "Reviewed work" },
      operator,
    );
    const id = created.milestones[0]?.id;
    if (!id) throw new TypeError("Missing review milestone");
    await mutateMilestone(id, { status: "in_progress" }, operator, "update");
    const review = await mutateMilestone(
      id,
      { status: "review" },
      operator,
      "update",
    );
    const expectedRevision = review.milestones[0]?.reviewRevision;
    const changed = await mutateMilestone(
      id,
      {
        name: "Unseen work",
        description: "Changed after approval click",
        dueDate: "2027-01-01",
      },
      operator,
      "update",
    );
    await expect(
      mutateMilestone(id, { expectedRevision }, primary, "approve"),
    ).rejects.toMatchObject({ statusCode: 409, code: "MILESTONE_CHANGED" });
    expect(await getProject(initial.id, primary)).toEqual(changed);
    const currentRevision = changed.milestones[0]?.reviewRevision;
    await sendMessage(
      { kind: "project", id: initial.id },
      {
        requestId: randomUUID(),
        body: "No false approval conflict",
        files: [],
        cleanup: () => Promise.resolve(),
      },
      operator,
    );
    expect(
      (
        await mutateMilestone(
          id,
          { expectedRevision: currentRevision },
          primary,
          "approve",
        )
      ).milestones[0]?.status,
    ).toBe("approved");
    expect(
      (
        await mutateMilestone(
          id,
          { name: "Ordinary approved edit" },
          operator,
          "update",
        )
      ).milestones[0]?.status,
    ).toBe("approved");
  });
  it("stores valid AD date boundaries and rejects year zero before manual persistence", async () => {
    const initial = await saveProject(
      {
        ...fields,
        startDate: "0001-01-01",
        dueDate: "9999-12-31",
        clientIds: [primary.id],
      },
      operator,
    );
    expect(initial).toMatchObject({
      startDate: "0001-01-01",
      dueDate: "9999-12-31",
    });
    await expect(
      editProject({ dueDate: "0000-01-01" }, initial.id),
    ).rejects.toBeDefined();
    await expect(
      createMilestone(
        initial.id,
        { name: "Invalid date", dueDate: "0000-01-01" },
        operator,
      ),
    ).rejects.toBeDefined();
    const valid = await createMilestone(
      initial.id,
      { name: "AD boundary", dueDate: "0001-01-01" },
      operator,
    );
    expect(valid.milestones[0]?.dueDate).toBe("0001-01-01");
  });
  it("enforces lock-in roles and linearizes competing client confirmation", async () => {
    await expect(
      transitionProject(project.id, { status: "active" }, operator),
    ).rejects.toMatchObject({ statusCode: 409 });
    const pending = await transitionProject(
      project.id,
      { status: "pending_lockin" },
      operator,
    );
    const results = await Promise.allSettled([
      transitionProject(
        project.id,
        { status: "active", expectedRevision: pending.lockRevision },
        member,
      ),
      transitionProject(
        project.id,
        { status: "active", expectedRevision: pending.lockRevision },
        primary,
      ),
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
  it("completes the primary-only dispute/resubmit/accept/archive path with real thread and scoped notifications", async () => {
    const initial = await activeProject();
    const changes: string[][] = [];
    const unsubscribe = subscribeProjects((change) => {
      if (change.projectId === initial.id) changes.push(change.clientIds);
    });
    try {
      const submitted = await transitionProject(
        initial.id,
        {
          status: "pending_approval",
          expectedRevision: initial.completionRevision,
        },
        operator,
      );
      await expect(
        transitionProject(
          initial.id,
          {
            status: "pending_approval",
            expectedRevision: initial.completionRevision,
          },
          operator,
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      await expect(
        transitionProject(
          initial.id,
          {
            status: "completed",
            expectedRevision: submitted.completionRevision,
          },
          member,
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        transitionProject(
          initial.id,
          {
            status: "completed",
            expectedRevision: submitted.completionRevision,
          },
          outsider,
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        transitionProject(
          initial.id,
          {
            status: "completed",
            expectedRevision: submitted.completionRevision,
          },
          operator,
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      await expect(
        transitionProject(
          initial.id,
          {
            status: "active",
            expectedRevision: submitted.completionRevision,
            reason: "  short  ",
          },
          primary,
        ),
      ).rejects.toBeDefined();
      expect(await getProject(initial.id, operator)).toEqual(submitted);
      const reason = "Please correct the navigation spacing before completion.";
      const disputed = await transitionProject(
        initial.id,
        {
          status: "active",
          expectedRevision: submitted.completionRevision,
          reason,
        },
        primary,
      );
      expect(disputed.status).toBe("active");
      for (const actor of [operator, primary, member]) {
        const thread = await listMessages(
          { kind: "project", id: initial.id },
          actor,
        );
        expect(thread.messages).toEqual([
          expect.objectContaining({
            body: `Completion disputed\n\n${reason}`,
            senderId: primary.id,
            senderType: "client",
          }),
        ]);
      }
      expect(
        (await messageSummary(operator)).conversations.find(
          (item) => item.id === initial.id,
        )?.unread,
      ).toBe(1);
      expect(
        (await messageSummary(outsider)).conversations.some(
          (item) => item.id === initial.id,
        ),
      ).toBe(false);
      const again = await transitionProject(
        initial.id,
        {
          status: "pending_approval",
          expectedRevision: disputed.completionRevision,
        },
        operator,
      );
      expect(again.lockRevision).toBe(submitted.lockRevision);
      expect(again.completionRevision).not.toBe(submitted.completionRevision);
      await expect(
        transitionProject(
          initial.id,
          {
            status: "completed",
            expectedRevision: submitted.completionRevision,
          },
          primary,
        ),
      ).rejects.toMatchObject({ code: "PROJECT_CHANGED" });
      const completed = await transitionProject(
        initial.id,
        { status: "completed", expectedRevision: again.completionRevision },
        primary,
      );
      expect(completed.status).toBe("completed");
      await expect(
        transitionProject(
          initial.id,
          {
            status: "archived",
            expectedRevision: completed.completionRevision,
          },
          primary,
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      const archived = await transitionProject(
        initial.id,
        { status: "archived", expectedRevision: completed.completionRevision },
        operator,
      );
      expect(archived.status).toBe("archived");
      expect(
        (await listProjects(member, { status: "archived" })).some(
          (item) => item.id === initial.id,
        ),
      ).toBe(true);
      expect(
        (await listMessages({ kind: "project", id: initial.id }, member))
          .messages,
      ).toHaveLength(1);
      const history = await getSql()<
        { event_type: string }[]
      >`select event_type from project_activity where project_id=${initial.id} and event_type in ('project.submitted_for_approval','project.disputed','project.accepted','project.archived') order by created_at,id`;
      expect(history.map((row) => row.event_type)).toEqual([
        "project.submitted_for_approval",
        "project.disputed",
        "project.submitted_for_approval",
        "project.accepted",
        "project.archived",
      ]);
      expect(changes).toHaveLength(5);
      expect(
        changes.every(
          (ids) =>
            ids.includes(primary.id) &&
            ids.includes(member.id) &&
            !ids.includes(outsider.id),
        ),
      ).toBe(true);
      await expect(
        transitionProject(
          initial.id,
          {
            status: "archived",
            expectedRevision: completed.completionRevision,
          },
          operator,
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      unsubscribe();
    }
  });
  it("serializes competing completion decisions and rejects stale current-primary, terms and prior-round reviews", async () => {
    const initial = await activeProject();
    const submitted = await transitionProject(
      initial.id,
      {
        status: "pending_approval",
        expectedRevision: initial.completionRevision,
      },
      operator,
    );
    const changed = await editProject(
      {
        clientIds: [member.id, primary.id],
        description: "New completion terms",
      },
      initial.id,
    );
    await expect(
      transitionProject(
        initial.id,
        { status: "completed", expectedRevision: submitted.completionRevision },
        primary,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      transitionProject(
        initial.id,
        { status: "completed", expectedRevision: submitted.completionRevision },
        member,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_CHANGED" });
    const results = await Promise.allSettled([
      transitionProject(
        initial.id,
        { status: "completed", expectedRevision: changed.completionRevision },
        member,
      ),
      transitionProject(
        initial.id,
        {
          status: "active",
          expectedRevision: changed.completionRevision,
          reason: "Concurrent reason must only persist if this decision wins.",
        },
        member,
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const after = await getProject(initial.id, operator);
    const messages = await listMessages(
      { kind: "project", id: initial.id },
      operator,
    );
    expect(messages.messages).toHaveLength(after.status === "active" ? 1 : 0);
    const history =
      await getSql()`select id from project_activity where project_id=${initial.id} and event_type in ('project.disputed','project.accepted')`;
    expect(history).toHaveLength(1);
  });
  it("rolls back dispute state/message/activity and publishes nothing on actual SQL failure, then retries", async () => {
    const initial = await activeProject();
    const submitted = await transitionProject(
      initial.id,
      {
        status: "pending_approval",
        expectedRevision: initial.completionRevision,
      },
      operator,
    );
    const owner = postgres(process.env.MIGRATION_DATABASE_URL ?? "", {
      max: 1,
      ssl: false,
    });
    const changes: string[] = [];
    const unsubscribe = subscribeProjects((change) => {
      if (change.projectId === initial.id) changes.push(change.projectId);
    });
    const decision = {
      status: "active",
      expectedRevision: submitted.completionRevision,
      reason: "Please repair the final responsive layout.",
    };
    try {
      await owner`revoke insert on project_activity from yinsen_runtime`;
      await expect(
        transitionProject(initial.id, decision, primary),
      ).rejects.toMatchObject({ code: "42501" });
      expect(await getProject(initial.id, primary)).toEqual(submitted);
      expect(
        (await listMessages({ kind: "project", id: initial.id }, operator))
          .messages,
      ).toHaveLength(0);
      expect(changes).toEqual([]);
    } finally {
      await owner`grant insert on project_activity to yinsen_runtime`;
      await owner.end();
      unsubscribe();
    }
    expect(
      (await transitionProject(initial.id, decision, primary)).status,
    ).toBe("active");
    expect(
      (await listMessages({ kind: "project", id: initial.id }, operator))
        .messages,
    ).toHaveLength(1);
  });
  it("exercises all completion route adapters, origin/actor/validation and reviewed PATCH dispatch", async () => {
    const initial = await activeProject();
    const session = await redeemMagicLink({
      token: (await issueMagicLink(primary.id, operator)).token,
    });
    const routeContext = context(initial.id);
    const body = { expectedRevision: initial.completionRevision };
    expect(
      (await submitPost(request("/", body, session.token), routeContext))
        .status,
    ).toBe(403);
    expect(
      (await submitPost(request("/", body, ""), routeContext)).status,
    ).toBe(401);
    expect(
      (
        await submitPost(
          new Request(origin, {
            method: "POST",
            headers: {
              origin: "https://foreign.test",
              cookie: `pylon_session=${token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          }),
          routeContext,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await PATCH(
          request("/", { status: "pending_approval", ...body }),
          routeContext,
        )
      ).status,
    ).toBe(200);
    const submitted = await getProject(initial.id, primary);
    expect(
      (
        await acceptPost(
          request("/", { expectedRevision: submitted.completionRevision }),
          routeContext,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await disputePost(
          request("/", { expectedRevision: submitted.completionRevision }),
          routeContext,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await disputePost(
          request(
            "/",
            { expectedRevision: submitted.completionRevision, reason: "short" },
            session.token,
          ),
          routeContext,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await disputePost(
          request(
            "/",
            {
              expectedRevision: submitted.completionRevision,
              reason: "A real route dispute reason",
            },
            session.token,
          ),
          routeContext,
        )
      ).status,
    ).toBe(200);
    const disputed = await getProject(initial.id, operator);
    expect(
      (
        await submitPost(
          request("/", { expectedRevision: disputed.completionRevision }),
          routeContext,
        )
      ).status,
    ).toBe(200);
    const again = await getProject(initial.id, primary);
    expect(
      (
        await acceptPost(
          request(
            "/",
            { expectedRevision: again.completionRevision },
            session.token,
          ),
          routeContext,
        )
      ).status,
    ).toBe(200);
    const completed = await getProject(initial.id, operator);
    expect(
      (
        await archivePost(
          request(
            "/",
            { expectedRevision: completed.completionRevision },
            session.token,
          ),
          routeContext,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await archivePost(
          request("/", { expectedRevision: completed.completionRevision }),
          routeContext,
        )
      ).status,
    ).toBe(200);
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
    const reviewed = (await getProject(project.id, primary)).milestones.find(
      (item) => item.id === milestone.id,
    );
    expect(reviewed).toBeDefined();
    const results = await Promise.allSettled([
      mutateMilestone(
        milestone.id,
        { expectedRevision: reviewed?.reviewRevision },
        primary,
        "approve",
      ),
      mutateMilestone(
        milestone.id,
        { expectedRevision: reviewed?.reviewRevision },
        primary,
        "approve",
      ),
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
      editProject({ clientIds: [primary.id, outsider.id] }),
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
      editProject({ clientIds: [randomUUID()] }),
    ).rejects.toBeDefined();
    expect(changes).toEqual([]);
    await editProject({ description: "Current truth" });
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
    await editProject({ clientIds: [primary.id] });
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
