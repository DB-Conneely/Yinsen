import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../src/lib/db/client";
import { completeSetup, isSetupComplete } from "../src/lib/setup/service";
import { loginOperator } from "../src/lib/auth/login";
import { saveClient, archiveClient } from "../src/lib/clients/service";
import type { ProjectActor } from "../src/lib/projects/access";
import { getProject } from "../src/lib/projects/queries";
import { actOnProposal } from "../src/lib/messages/proposal-actions";
import {
  proposalAction,
  proposalTerms,
  proposalView,
  storedProposalTerms,
  type ProposalTerms,
} from "../src/lib/messages/proposal-validators";
import { listMessages } from "../src/lib/messages/queries";
import type { Conversation } from "../src/lib/messages/access";
import { subscribeProjects } from "../src/lib/events/hub";
import { POST } from "../src/app/api/clients/[id]/messages/route";
import { getBranding } from "../src/lib/settings";

let operator: ProjectActor & { role: "operator" },
  client: ProjectActor,
  foreign: ProjectActor,
  token: string;
let conversation: Conversation;
const terms: ProposalTerms = {
  name: "Negotiated work",
  description: "Exact agreed scope",
  budget: 12345,
  currency: "GBP",
  milestones: [
    { name: "Design", description: "First", dueDate: "2027-01-02" },
    { name: "Build", description: "Second", dueDate: null },
  ],
};
const propose = (
  actor: ProjectActor = operator,
  data = terms,
): ReturnType<typeof actOnProposal> =>
  actOnProposal(
    conversation,
    { type: "proposal", requestId: randomUUID(), terms: data },
    actor,
  );
const latest = async (): Promise<string> => {
  const rows = await listMessages(conversation, operator);
  const id = rows.messages.at(-1)?.id;
  if (!id) throw new TypeError("Fixture proposal missing");
  return id;
};
const respond = (
  type: "counter" | "accept" | "reject",
  proposalId: string,
  actor: ProjectActor,
  requestId = randomUUID(),
  data = terms,
): ReturnType<typeof actOnProposal> =>
  actOnProposal(
    conversation,
    {
      type,
      requestId,
      proposalId,
      ...(type === "counter" ? { terms: data } : {}),
    },
    actor,
  );

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
      { name: "Proposal client", email: `${randomUUID()}@example.test` },
      operator,
    )),
    role: "client",
  };
  foreign = {
    ...(await saveClient(
      { name: "Proposal foreign", email: `${randomUUID()}@example.test` },
      operator,
    )),
    role: "client",
  };
  conversation = { kind: "client", id: client.id };
});
afterAll(async () => {
  await getSql().end({ timeout: 5 });
});

describe("proposal authority and shared transaction writers", () => {
  it("validates complete integer-minor-unit terms, structured actions and current card state", () => {
    expect(proposalTerms.parse(terms)).toEqual(terms);
    for (const budget of [-1, 1.5, 2147483648, Infinity])
      expect(proposalTerms.safeParse({ ...terms, budget }).success).toBe(false);
    expect(
      proposalTerms.safeParse({
        ...terms,
        milestones: [{ name: "Invalid", dueDate: "2027-02-30" }],
      }).success,
    ).toBe(false);
    expect(
      proposalAction.safeParse({
        type: "proposal",
        requestId: randomUUID(),
        terms,
        senderType: "operator",
      }).success,
    ).toBe(false);
    expect(
      proposalView.safeParse({
        chainId: randomUUID(),
        replyTo: null,
        terms,
        latestId: randomUUID(),
        state: "pending",
        projectId: null,
        canRespond: true,
      }).success,
    ).toBe(true);
  });
  it("rejects unsupported write dates while preserving narrowly validated historic terms", () => {
    const historic = {
      ...terms,
      milestones: [{ ...terms.milestones[0], dueDate: "0000-01-01" }],
    };
    expect(proposalTerms.safeParse(historic).success).toBe(false);
    expect(storedProposalTerms.parse(historic)).toEqual(historic);
    for (const dueDate of ["0001-01-01", "9999-12-31", null])
      expect(
        proposalTerms.safeParse({
          ...terms,
          milestones: [{ name: "Boundary", dueDate }],
        }).success,
      ).toBe(true);
    for (const dueDate of ["0000-01-01", "2027-02-30", "10000-01-01"])
      expect(
        proposalTerms.safeParse({
          ...terms,
          milestones: [{ name: "Invalid", dueDate }],
        }).success,
      ).toBe(false);
    expect(
      storedProposalTerms.safeParse({
        ...historic,
        milestones: [{ name: "Invalid", dueDate: "2027-02-30" }],
      }).success,
    ).toBe(false);
    expect(
      storedProposalTerms.safeParse({ ...historic, actorId: randomUUID() })
        .success,
    ).toBe(false);
  });
  it("keeps old year-zero cards readable and recoverable without partially accepting them", async () => {
    const historic = {
      ...terms,
      milestones: [
        { name: "Historic date", description: "", dueDate: "0000-01-01" },
      ],
    };
    const proposalId = randomUUID();
    // Fixture represents a proposal genuinely accepted by the earlier write schema.
    await getSql()`insert into messages(id,client_id,sender_type,sender_id,body,fingerprint,type,chain_id,proposal_data) values(${proposalId},${client.id},'operator',${operator.id},'Historic date proposal',${proposalId},'proposal',${proposalId},${JSON.stringify(historic)}::jsonb)`;
    const cards = await listMessages(conversation, client);
    expect(
      cards.messages.find((row) => row.id === proposalId)?.proposal,
    ).toMatchObject({
      terms: historic,
      canRespond: true,
    });
    const before =
      await getSql()`select (select count(*) from projects)::int as projects,(select count(*) from project_clients)::int as members,(select count(*) from milestones)::int as milestones,(select count(*) from project_activity)::int as activity`;
    const requestId = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++)
      await expect(
        respond("accept", proposalId, client, requestId),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "PROPOSAL_TERMS_INVALID",
        message:
          "These stored terms cannot create a project. Counter with valid milestone dates (years 0001–9999), or reject this proposal.",
      });
    expect(
      await getSql()`select (select count(*) from projects)::int as projects,(select count(*) from project_clients)::int as members,(select count(*) from milestones)::int as milestones,(select count(*) from project_activity)::int as activity`,
    ).toEqual(before);
    expect(
      await getSql()`select id from messages where reply_to=${proposalId}`,
    ).toHaveLength(0);
    await respond("counter", proposalId, client, randomUUID(), {
      ...terms,
      milestones: [
        { name: "Corrected date", description: "", dueDate: "0001-01-01" },
      ],
    });
    await respond("accept", await latest(), operator);
    const after = await listMessages(conversation, client);
    expect(
      after.messages.find((row) => row.id === proposalId)?.proposal?.terms,
    ).toEqual(historic);
    expect(
      proposalView.safeParse(
        after.messages.find((row) => row.id === proposalId)?.proposal,
      ).success,
    ).toBe(true);
  });
  it("negotiates multiple rounds, creates exactly one active project and preserves the immutable agreement", async () => {
    await propose();
    const first = await latest();
    await respond("counter", first, client, randomUUID(), {
      ...terms,
      name: "Client amendment",
      budget: 22345,
    });
    const second = await latest();
    await respond("counter", second, operator, randomUUID(), {
      ...terms,
      name: "Final scope",
      budget: 32345,
    });
    const third = await latest();
    const id = randomUUID();
    const result = await respond("accept", third, client, id);
    const accepted = result.messages.find((row) => row.id === id);
    expect(accepted?.type).toBe("accept");
    expect(accepted?.proposal?.state).toBe("accepted");
    const projectId = accepted?.proposal?.projectId;
    expect(projectId).toBeTruthy();
    if (!projectId) return;
    const project = await getProject(projectId, client);
    expect(project.status).toBe("active");
    expect(project.name).toBe("Final scope");
    expect(project.budget).toBe(32345);
    expect(project.currency).toBe("GBP");
    expect(project.members.map((row) => [row.id, row.role])).toEqual([
      [client.id, "primary"],
    ]);
    expect(
      project.milestones.map((row) => [row.name, row.description, row.dueDate]),
    ).toEqual(
      terms.milestones.map((row) => [row.name, row.description, row.dueDate]),
    );
    await respond("accept", third, client, id);
    await expect(respond("accept", third, client)).rejects.toMatchObject({
      statusCode: 409,
    });
    const facts =
      await getSql()`select proposal_snapshot::text as proposal_snapshot from projects where proposal_message_id=${third}`;
    expect(facts).toHaveLength(1);
    expect(JSON.parse(String(facts[0]?.proposal_snapshot))).toEqual({
      ...terms,
      name: "Final scope",
      budget: 32345,
    });
    await expect(
      getSql()`update projects set proposal_snapshot='{}'::jsonb where id=${projectId}`,
    ).rejects.toMatchObject({ code: "23514" });
    const cards = await listMessages(conversation, operator);
    expect(
      cards.messages
        .filter((row) => row.proposal?.chainId === first)
        .every((row) => !row.proposal?.canRespond),
    ).toBe(true);
  });
  it("allows client-initiated proposals, recipient-only actions and no project on rejection", async () => {
    await propose(client);
    const id = await latest();
    await expect(respond("accept", id, client)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(respond("counter", id, foreign)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      respond("reject", randomUUID(), foreign),
    ).rejects.toMatchObject({ statusCode: 404 });
    await respond("reject", id, operator);
    expect(
      await getSql()`select id from projects where proposal_message_id=${id}`,
    ).toHaveLength(0);
    await expect(respond("counter", id, operator)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
  it("serializes competing acceptances and accept/counter/reject races with one successor", async () => {
    await propose(client);
    const id = await latest();
    const results = await Promise.allSettled([
      respond("accept", id, operator),
      respond("accept", id, operator),
      respond("counter", id, operator),
      respond("reject", id, operator),
    ]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(
      await getSql()`select id from messages where reply_to=${id}`,
    ).toHaveLength(1);
    const projects =
      await getSql()`select id from projects where proposal_message_id=${id}`;
    expect(projects.length).toBeLessThanOrEqual(1);
    await propose();
    const p = await latest();
    await respond("counter", p, client);
    await expect(respond("accept", p, client)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
  it("stable retries preserve persistence/activity and repair payload-free invalidation", async () => {
    const events: string[] = [];
    const unsubscribe = subscribeProjects((event) =>
      events.push(JSON.stringify(event)),
    );
    try {
      const id = randomUUID(),
        action = { type: "proposal", requestId: id, terms };
      await actOnProposal(conversation, action, operator);
      const count = events.length;
      await actOnProposal(conversation, action, operator);
      expect(events.length).toBe(count + 1);
      expect(events.join("")).not.toContain(terms.description);
      expect(
        await getSql()`select id from messages where id=${id}`,
      ).toHaveLength(1);
      await expect(
        actOnProposal(
          conversation,
          { ...action, terms: { ...terms, budget: 4 } },
          operator,
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      unsubscribe();
    }
  });
  it("rolls back project/members/milestones/terminal message/activity together on real INSERT failure", async () => {
    await propose();
    const id = await latest(),
      actionId = randomUUID();
    const migrator = postgres(process.env.MIGRATION_DATABASE_URL ?? "", {
      max: 1,
      ssl: false,
    });
    const before =
      await getSql()`select (select count(*) from projects)::int as projects,(select count(*) from project_clients)::int as members,(select count(*) from milestones)::int as milestones,(select count(*) from project_activity)::int as activity`;
    try {
      await migrator`revoke insert on milestones from yinsen_runtime`;
      await expect(
        respond("accept", id, client, actionId),
      ).rejects.toMatchObject({ code: "42501" });
      expect(
        await getSql()`select (select count(*) from projects)::int as projects,(select count(*) from project_clients)::int as members,(select count(*) from milestones)::int as milestones,(select count(*) from project_activity)::int as activity`,
      ).toEqual(before);
      expect(
        await getSql()`select id from messages where id=${actionId}`,
      ).toHaveLength(0);
    } finally {
      await migrator`grant insert on milestones to yinsen_runtime`;
      await migrator.end();
    }
    await respond("accept", id, client, actionId);
    expect(
      await getSql()`select id from projects where proposal_message_id=${id}`,
    ).toHaveLength(1);
  });
  it("enforces structured SQL shape, successor uniqueness and general-conversation-only actions", async () => {
    await expect(
      getSql()`insert into messages(client_id,sender_type,sender_id,body,fingerprint,type) values(${client.id},'operator',${operator.id},'invalid','invalid','proposal')`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      actOnProposal(
        { kind: "project", id: randomUUID() },
        { type: "proposal", requestId: randomUUID(), terms },
        operator,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await propose();
    const id = await latest();
    await respond("reject", id, client);
    await expect(
      getSql()`insert into messages(client_id,sender_type,sender_id,body,fingerprint,type,chain_id,reply_to) values(${client.id},'client',${client.id},'duplicate','duplicate','accept',${id},${id})`,
    ).rejects.toMatchObject({ code: "23505" });
  });
  it("uses actual message route auth/CSRF/strict schema and denies archived current clients", async () => {
    const origin = process.env.APP_ORIGIN ?? "http://localhost:3025";
    const context = { params: Promise.resolve({ id: client.id }) };
    const request = (headers: Record<string, string>): Request =>
      new Request(`${origin}/api/clients/${client.id}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie: `pylon_session=${token}`,
          ...headers,
        },
        body: JSON.stringify({
          type: "proposal",
          requestId: randomUUID(),
          terms,
        }),
      });
    expect(
      (await POST(request({ origin: "https://foreign.invalid" }), context))
        .status,
    ).toBe(403);
    expect((await POST(request({ cookie: "" }), context)).status).toBe(401);
    expect((await POST(request({}), context)).status).toBe(200);
    await archiveClient(foreign.id, operator, false);
    await expect(
      actOnProposal(
        { kind: "client", id: foreign.id },
        { type: "proposal", requestId: randomUUID(), terms },
        foreign,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
