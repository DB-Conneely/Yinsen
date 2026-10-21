import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement, Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getSql } from "../src/lib/db/client";
import { completeSetup, isSetupComplete } from "../src/lib/setup/service";
import { loginOperator } from "../src/lib/auth/login";
import { getBranding } from "../src/lib/settings";
import { saveClient, archiveClient } from "../src/lib/clients/service";
import { saveProject, transitionProject } from "../src/lib/projects/service";
import type { ProjectDetail } from "../src/lib/projects/queries";
import {
  createInvoice,
  sendInvoice,
  settleInvoice,
  cancelInvoice,
} from "../src/lib/invoices/service";
import { getInvoice } from "../src/lib/invoices/queries";
import {
  readAnalytics,
  type AnalyticsSnapshot,
} from "../src/lib/analytics/queries";
import { analyticsPeriod, analyticsWindow } from "../src/lib/analytics/period";
import {
  analyticsMoney,
  activityLabel,
  barPercent,
  monthLabel,
  monthlyChange,
} from "../src/lib/analytics/format";
import AnalyticsError from "../src/app/dashboard/analytics/error";
import DashboardError from "../src/app/dashboard/error";
import AnalyticsLoading from "../src/app/dashboard/analytics/loading";
import DashboardLoading from "../src/app/dashboard/loading";
import { issueMagicLink, redeemMagicLink } from "../src/lib/auth/client";
import { subscribeProjects } from "../src/lib/events/hub";
import { listMessages, messageSummary } from "../src/lib/messages/queries";
import { markMessagesRead } from "../src/lib/messages/service";
import {
  DashboardView,
  AnalyticsView,
} from "../src/components/analytics-views";
import {
  MonthlyRevenue,
  RevenueStats,
  ClientRevenueTable,
} from "../src/components/analytics-revenue";
import { GET as revenueGet } from "../src/app/api/analytics/revenue/route";
import { GET as projectsGet } from "../src/app/api/analytics/projects/route";
import { GET as clientsGet } from "../src/app/api/analytics/clients/route";
import type { OperatorIdentity } from "../src/lib/auth/session";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let actor: OperatorIdentity;
let token: string;
let clientId: string;
let otherId: string;
let paidId: string;
const ids: string[] = [];
const owner = postgres(process.env.MIGRATION_DATABASE_URL ?? "", {
  max: 1,
  onnotice: () => undefined,
});
const receipt = {
  amountReceived: 12345,
  paymentMethod: "bank_transfer",
  reference: "Analytics receipt",
};

async function invoice(
  currency: string,
  amount: number,
  client = clientId,
): Promise<string> {
  const draft = await createInvoice(
    {
      requestId: randomUUID(),
      clientId: client,
      currency,
      lineItems: [
        { description: "Analytics work", quantity: "1", unitPrice: amount },
      ],
    },
    actor,
  );
  ids.push(draft.id);
  await sendInvoice(draft.id, { expectedRevision: draft.revision }, actor);
  return draft.id;
}

async function activeAnalyticsProject(name: string): Promise<ProjectDetail> {
  let project = await saveProject(
    { name, currency: "GBP", clientIds: [clientId] },
    actor,
  );
  project = await transitionProject(
    project.id,
    { status: "pending_lockin" },
    actor,
  );
  return transitionProject(
    project.id,
    { status: "active", expectedRevision: project.lockRevision },
    { id: clientId, role: "client" },
  );
}

async function disputedAnalyticsProject(): Promise<ProjectDetail> {
  let project = await activeAnalyticsProject("Unresolved analytics changes");
  project = await transitionProject(
    project.id,
    {
      status: "pending_approval",
      expectedRevision: project.completionRevision,
    },
    actor,
  );
  project = await transitionProject(
    project.id,
    {
      status: "active",
      expectedRevision: project.completionRevision,
      reason: "Please revise the final project handover.",
    },
    { id: clientId, role: "client" },
  );
  const conversation = { kind: "project" as const, id: project.id };
  const messages = await listMessages(conversation, actor);
  await markMessagesRead(
    conversation,
    { ids: messages.messages.map((message) => message.id) },
    actor,
  );
  return project;
}

function attentionMarkup(snapshot: AnalyticsSnapshot): string {
  const html = renderToStaticMarkup(
    createElement(DashboardView, { snapshot, name: "Morgan" }),
  );
  return html.split('id="needs-attention"')[1]?.split("</section>")[0] ?? "";
}

function expectChangeRequest(
  snapshot: AnalyticsSnapshot,
  project: ProjectDetail,
): void {
  expect(
    snapshot.overview.projects.find((p) => p.id === project.id),
  ).toMatchObject({ status: project.status, disputed: true });
  expect(
    snapshot.overview.unread.conversations.find((c) => c.id === project.id)
      ?.unread ?? 0,
  ).toBe(0);
  const attention = attentionMarkup(snapshot);
  expect(attention).toContain(`/dashboard/projects/${project.id}#messages`);
  expect(attention).toContain("Changes requested");
}

beforeAll(async () => {
  await getBranding();
  if (!(await isSetupComplete()))
    await completeSetup({
      name: "Remote Operator",
      email: "operator@example.test",
      password: "remote-proof-password-12!",
      brandName: "Remote Studio",
      brandColour: "#315e9e",
      defaultCurrency: "GBP",
    });
  const login = await loginOperator({
    email: "operator@example.test",
    password: "remote-proof-password-12!",
  });
  actor = login.user;
  token = login.session.token;
  clientId = (
    await saveClient(
      { name: "Same analytics name", email: `${randomUUID()}@example.test` },
      actor,
    )
  ).id;
  otherId = (
    await saveClient(
      { name: "Same analytics name", email: `${randomUUID()}@example.test` },
      actor,
    )
  ).id;
  paidId = await invoice("GBP", 12345);
  await settleInvoice(paidId, receipt, actor);
});
afterAll(async () => {
  await owner.end();
  await getSql().end();
});

describe("operator analytics over actual financial and project facts", () => {
  it("uses explicit UTC calendar boundaries including leap/month/year edges", () => {
    const now = new Date("2024-03-01T00:00:00.123Z");
    expect(analyticsWindow("30d", now).from).toBe("2024-02-01T00:00:00.000Z");
    expect(analyticsWindow("90d", now).from).toBe("2023-12-03T00:00:00.000Z");
    expect(analyticsWindow("12m", now).from).toBe("2023-04-01T00:00:00.000Z");
    expect(analyticsWindow("all", now).from).toBeNull();
    expect(analyticsWindow(undefined, now).period).toBe("30d");
    expect(analyticsPeriod.safeParse("infinity").success).toBe(false);
  });
  it("keeps zero, large, zero/three decimal currencies and bar ratios exact", () => {
    expect(analyticsMoney("9007199254740993123", "GBP")).toBe(
      "GBP 90,071,992,547,409,931.23",
    );
    expect(analyticsMoney("12345", "KWD")).toBe("KWD 12.345");
    expect(analyticsMoney("12345", "JPY")).toBe("JPY 12,345");
    expect(analyticsMoney("0", "GBP")).toBe("GBP 0.00");
    expect(barPercent("0", "0")).toBe(0);
    expect(barPercent("1", "3")).toBe(33.33);
    expect(monthLabel("2026-10")).toBe("Oct 26");
    expect(activityLabel("project.accepted")).toBe("Project completed");
    expect(activityLabel("client.created")).toBe("client created");
    expect(monthlyChange("0", "0")).toContain("No change");
    expect(monthlyChange("100", "0")).toContain("First receipts");
    expect(monthlyChange("150", "100")).toBe("+50.0% vs previous month");
    expect(monthlyChange("0", "100")).toBe("−100.0% vs previous month");
    expect(monthlyChange("100", "100")).toBe("0.0% vs previous month");
  });
  it("separates currencies and UUID identities, excludes unpaid money, retains archived receipts and ignores replay", async () => {
    const usd = await invoice("USD", 7654, otherId);
    await settleInvoice(usd, { ...receipt, amountReceived: 7654 }, actor);
    const unpaid = await invoice("GBP", 4000);
    await owner`update invoices set due_date=(now() at time zone 'UTC')::date-1 where id=${unpaid}`;
    await settleInvoice(paidId, receipt, actor);
    await archiveClient(otherId, actor, false);
    const s = await readAnalytics(actor, "all");
    expect(
      s.revenue.revenueByClient.find((r) => r.id === clientId),
    ).toMatchObject({ currency: "GBP", amount: "12345", invoiceCount: 1 });
    expect(
      s.revenue.revenueByClient.find((r) => r.id === otherId),
    ).toMatchObject({ currency: "USD", amount: "7654", archived: true });
    const gbp = s.revenue.currencies.find((r) => r.currency === "GBP");
    expect(BigInt(gbp?.overdueAmount ?? "0")).toBeGreaterThanOrEqual(4000n);
    const direct = await getSql()<
      { currency: string; amount: string; count: number }[]
    >`select currency,sum(coalesce(total_override,amount))::text as amount,count(*)::int as count from invoices where status in ('paid','settled') and paid_at<${s.window.asOf} group by currency order by currency`;
    for (const row of direct)
      expect(
        s.revenue.currencies.find((r) => r.currency === row.currency),
      ).toMatchObject({
        totalRevenue: row.amount,
        paidInvoiceCount: row.count,
      });
    expect(
      s.revenue.revenueByClient
        .filter((r) => r.name === "Same analytics name")
        .map((r) => r.id),
    ).toEqual(expect.arrayContaining([clientId, otherId]));
  });
  it("includes the exact lower boundary and excludes prior/future receipts while current unpaid stays visible", async () => {
    const edge = analyticsWindow("30d", new Date()).from;
    if (!edge) throw new TypeError("Expected a bounded window");
    await owner`update invoices set paid_at=${edge} where id=${paidId}`;
    expect(
      (await readAnalytics(actor, "30d")).revenue.revenueByClient.find(
        (r) => r.id === clientId,
      )?.amount,
    ).toBe("12345");
    await owner`update invoices set paid_at=${edge}::timestamptz-interval '1 microsecond' where id=${paidId}`;
    expect(
      (await readAnalytics(actor, "30d")).revenue.revenueByClient.some(
        (r) => r.id === clientId,
      ),
    ).toBe(false);
    expect(
      (await readAnalytics(actor, "90d")).revenue.revenueByClient.find(
        (r) => r.id === clientId,
      )?.amount,
    ).toBe("12345");
    await owner`update invoices set paid_at=now()+interval '1 day' where id=${paidId}`;
    expect(
      (await readAnalytics(actor, "all")).revenue.revenueByClient.some(
        (r) => r.id === clientId,
      ),
    ).toBe(false);
    await owner`update invoices set paid_at=now() where id=${paidId}`;
  });
  it("derives completion from acceptance including archive and never from later updated_at", async () => {
    let p = await saveProject(
      {
        name: "Accepted analytics project",
        currency: "GBP",
        clientIds: [clientId],
      },
      actor,
    );
    p = await transitionProject(p.id, { status: "pending_lockin" }, actor);
    const client = { id: clientId, role: "client" as const };
    p = await transitionProject(
      p.id,
      { status: "active", expectedRevision: p.lockRevision },
      client,
    );
    p = await transitionProject(
      p.id,
      { status: "pending_approval", expectedRevision: p.completionRevision },
      actor,
    );
    p = await transitionProject(
      p.id,
      { status: "completed", expectedRevision: p.completionRevision },
      client,
    );
    p = await transitionProject(
      p.id,
      { status: "archived", expectedRevision: p.completionRevision },
      actor,
    );
    await owner`update projects set created_at=now()-interval '10 days',updated_at=now()+interval '100 days' where id=${p.id}`;
    const s = await readAnalytics(actor, "30d");
    expect(s.projects.completedProjects).toBeGreaterThan(0);
    expect(
      s.projects.projectsByStatus.find((r) => r.status === "archived")?.count,
    ).toBeGreaterThan(0);
    expect(s.projects.averageProjectDuration).toBeLessThan(11);
    expect(s.projects.averageProjectDuration).toBeGreaterThanOrEqual(0);
    const activity = s.overview.activity.find(
      (r) => r.event === "project.accepted" && r.href.endsWith(p.id),
    );
    expect(activity?.name).toBe(p.name);
  });
  it("publishes client saves only after committed facts and keeps default/transaction unread reads equal", async () => {
    const observed: string[] = [];
    const unsubscribe = subscribeProjects((change) =>
      observed.push(...change.clientIds),
    );
    try {
      const saved = await saveClient(
        {
          name: "Committed live client",
          email: `${randomUUID()}@example.test`,
        },
        actor,
      );
      expect(observed).toContain(saved.id);
      const scoped = await getSql().begin(
        "isolation level repeatable read read only",
        (sql) => messageSummary(actor, sql),
      );
      expect(scoped).toEqual(await messageSummary(actor));
    } finally {
      unsubscribe();
    }
  });
  it("retains read change requests through pause and resume until resubmission", async () => {
    let project = await disputedAnalyticsProject();
    const initial = await readAnalytics(actor, "all");
    expect(attentionMarkup(initial)).toContain(project.name);
    for (const status of ["paused", "active"]) {
      project = await transitionProject(project.id, { status }, actor);
      const snapshot = await readAnalytics(actor, "all");
      expectChangeRequest(snapshot, project);
      expect(snapshot.overview.activeProjects).toBe(
        initial.overview.activeProjects - (status === "paused" ? 1 : 0),
      );
    }
    await transitionProject(
      project.id,
      {
        status: "pending_approval",
        expectedRevision: project.completionRevision,
      },
      actor,
    );
    const resubmitted = await readAnalytics(actor, "all");
    expect(
      resubmitted.overview.projects.find((p) => p.id === project.id),
    ).toMatchObject({ status: "pending_approval", disputed: false });
    expect(attentionMarkup(resubmitted)).not.toContain(
      `/dashboard/projects/${project.id}#messages`,
    );
    expect(attentionMarkup(resubmitted)).toContain(
      "Awaiting completion review",
    );
  });
  it("does not turn an ordinary paused project into a pending client decision", async () => {
    const project = await activeAnalyticsProject(
      "Ordinary paused analytics work",
    );
    await transitionProject(project.id, { status: "paused" }, actor);
    const snapshot = await readAnalytics(actor, "all");
    expect(
      snapshot.overview.projects.find((p) => p.id === project.id),
    ).toMatchObject({ status: "paused", disputed: false });
    expect(attentionMarkup(snapshot)).not.toContain(project.name);
    const html = renderToStaticMarkup(
      createElement(DashboardView, { snapshot, name: "Morgan" }),
    );
    expect(html).not.toContain(`aria-label="${project.name}:`);
  });
  it("keeps totals and charts coherent while a real invoice transitions concurrently", async () => {
    const id = await invoice("JPY", 76543);
    const change = settleInvoice(
      id,
      { ...receipt, amountReceived: 76543 },
      actor,
    );
    const s = await readAnalytics(actor, "all");
    await change;
    for (const currency of s.revenue.currencies) {
      expect(
        s.revenue.revenueByMonth
          .filter((m) => m.currency === currency.currency)
          .reduce((sum, m) => sum + BigInt(m.amount), 0n),
      ).toBe(BigInt(currency.totalRevenue));
      expect(
        s.revenue.revenueByClient
          .filter((m) => m.currency === currency.currency)
          .reduce((sum, m) => sum + BigInt(m.amount), 0n),
      ).toBe(BigInt(currency.totalRevenue));
    }
    expect((await getInvoice(id, actor)).status).toBe("settled");
  });
  it("protects every actual API caller and rejects malformed periods", async () => {
    const link = await issueMagicLink(clientId, actor);
    const session = await redeemMagicLink({
      token: new URL(link.url).hash.slice(1),
    });
    const origin = process.env.APP_ORIGIN ?? "http://localhost:3092";
    for (const handler of [revenueGet, projectsGet, clientsGet]) {
      expect(
        (await handler(new Request(`${origin}/api/analytics/revenue`))).status,
      ).toBe(401);
      const valid = new Request(`${origin}/api/analytics/revenue?period=all`, {
        headers: { cookie: `pylon_session=${token}` },
      });
      const response = await handler(valid);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(
        (
          await handler(
            new Request(`${origin}/api/analytics/revenue`, {
              headers: { cookie: `pylon_session=${session.token}` },
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await handler(
            new Request(`${origin}/api/analytics/revenue?period=bad`, {
              headers: { cookie: `pylon_session=${token}` },
            }),
          )
        ).status,
      ).toBe(400);
    }
    await expect(
      readAnalytics({ id: clientId, role: "client" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("uses actual framework Retry callbacks and useful loading content", () => {
    for (const ErrorPage of [AnalyticsError, DashboardError]) {
      const retry = vi.fn();
      const tree = ErrorPage({ retry });
      if (!isValidElement<{ children: ReactNode }>(tree))
        throw new TypeError("Expected error view");
      for (const child of Children.toArray(tree.props.children))
        if (
          isValidElement<{ onClick?: () => void }>(child) &&
          child.type === "button"
        )
          child.props.onClick?.();
      expect(retry).toHaveBeenCalledOnce();
    }
    expect(renderToStaticMarkup(createElement(AnalyticsLoading))).toContain(
      "Reading the latest numbers",
    );
    expect(renderToStaticMarkup(createElement(DashboardLoading))).toContain(
      "Reading the latest records",
    );
  });
  it("sums beyond a single invoice limit and uses frozen override/currency, independently of defaults", async () => {
    const large = await invoice("KWD", 2147483647);
    await settleInvoice(
      large,
      { ...receipt, amountReceived: 2147483647 },
      actor,
    );
    const second = await invoice("KWD", 2147483647);
    await settleInvoice(
      second,
      { ...receipt, amountReceived: 2147483647 },
      actor,
    );
    const draft = await createInvoice(
      {
        requestId: randomUUID(),
        clientId,
        currency: "KWD",
        totalOverride: 1234,
        lineItems: [
          { description: "Agreed override", quantity: "1", unitPrice: 9999 },
        ],
      },
      actor,
    );
    await sendInvoice(draft.id, { expectedRevision: draft.revision }, actor);
    await settleInvoice(draft.id, { ...receipt, amountReceived: 1234 }, actor);
    const before = await readAnalytics(actor, "all");
    expect(
      before.revenue.revenueByClient.find(
        (r) => r.id === clientId && r.currency === "KWD",
      )?.amount,
    ).toBe("4294968528");
    const [settings] = await owner<
      { currency: string }[]
    >`select default_currency as currency from settings`;
    try {
      await owner`update settings set default_currency='JPY'`;
      expect((await readAnalytics(actor, "all")).revenue).toEqual(
        before.revenue,
      );
    } finally {
      await owner`update settings set default_currency=${settings?.currency ?? "GBP"}`;
    }
  });
  it("renders navigable meaningful money, status, empty and history views", async () => {
    const snapshot = await readAnalytics(actor, "12m");
    for (const View of [AnalyticsView, DashboardView]) {
      const html = renderToStaticMarkup(
        createElement(View, { snapshot, name: "Morgan" }),
      );
      expect(html).toContain("/dashboard/");
      expect(html).not.toContain("NaN");
      expect(html).toContain("GBP");
    }
    const empty: AnalyticsSnapshot = {
      ...snapshot,
      revenue: { currencies: [], revenueByMonth: [], revenueByClient: [] },
    };
    expect(
      renderToStaticMarkup(createElement(RevenueStats, { snapshot: empty })),
    ).toContain("No invoice activity yet");
    expect(
      renderToStaticMarkup(
        createElement(MonthlyRevenue, { revenue: empty.revenue }),
      ),
    ).toContain("first received payment");
    expect(
      renderToStaticMarkup(
        createElement(ClientRevenueTable, { rows: [], title: "Top clients" }),
      ),
    ).toContain("No received payments");
    expect(
      renderToStaticMarkup(
        createElement(ClientRevenueTable, {
          rows: snapshot.clients.topClients,
          title: "Top clients",
        }),
      ),
    ).toContain("Archived");
  });
  it("excludes cancelled/deleted unpaid invoices without erasing received financial history", async () => {
    const id = await invoice("GBP", 300);
    const before = await readAnalytics(actor, "all");
    await cancelInvoice(id, actor, true);
    const after = await readAnalytics(actor, "all");
    expect(
      BigInt(
        before.revenue.currencies.find((r) => r.currency === "GBP")
          ?.outstandingAmount ?? "0",
      ) -
        BigInt(
          after.revenue.currencies.find((r) => r.currency === "GBP")
            ?.outstandingAmount ?? "0",
        ),
    ).toBe(300n);
    expect(
      after.revenue.revenueByClient.find((r) => r.id === clientId)?.amount,
    ).toBe("12345");
  });
});
