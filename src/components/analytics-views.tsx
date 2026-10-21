import type { ReactElement } from "react";
import Link from "next/link";
import type { AnalyticsSnapshot } from "../lib/analytics/queries";
import {
  analyticsMoney,
  activityLabel,
  monthlyChange,
} from "../lib/analytics/format";
import { AnalyticsLive } from "./analytics-live";
import {
  MonthlyRevenue,
  RevenueStats,
  ClientRevenueTable,
} from "./analytics-revenue";

function Periods({ snapshot }: { snapshot: AnalyticsSnapshot }): ReactElement {
  const labels = {
    "30d": "30 days",
    "90d": "90 days",
    "12m": "12 months",
    all: "All time",
  };
  return (
    <nav className="period-switch" aria-label="Analytics period">
      {Object.entries(labels).map(([value, label]) => (
        <Link
          prefetch={false}
          key={value}
          href={`/dashboard/analytics?period=${value}`}
          aria-current={snapshot.window.period === value ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function AnalyticsView({
  snapshot,
}: {
  snapshot: AnalyticsSnapshot;
}): ReactElement {
  return (
    <div className="analytics-page">
      <AnalyticsHeading snapshot={snapshot} />
      <RevenueStats snapshot={snapshot} />
      <p className="analytics-note">
        Revenue counts the first full paid or settled invoice receipt in this
        period. Currencies stay separate. Outstanding and overdue show current
        unpaid invoices, including those issued earlier.
      </p>
      <MonthlyRevenue revenue={snapshot.revenue} />
      <ClientRevenueTable
        rows={snapshot.revenue.revenueByClient}
        title="Revenue by client"
      />
      <ProjectAnalytics snapshot={snapshot} />
      <ClientAnalytics snapshot={snapshot} />
      <ClientRevenueTable
        rows={snapshot.clients.topClients}
        title="Top clients · five per currency"
      />
      <p className="analytics-note">
        One consistent snapshot at{" "}
        {new Date(snapshot.window.asOf).toLocaleString("en-GB", {
          timeZone: "UTC",
        })}{" "}
        UTC. Amounts use each invoice’s frozen currency and total. Average
        invoice values round to the nearest minor unit.
      </p>
    </div>
  );
}

function AnalyticsHeading({
  snapshot,
}: {
  snapshot: AnalyticsSnapshot;
}): ReactElement {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">The wider picture</p>
          <h1>Analytics</h1>
          <p>Clear numbers. A considered view of your business.</p>
        </div>
        <Periods snapshot={snapshot} />
      </div>
      <p className="analytics-period">
        {snapshot.window.from
          ? `From ${snapshot.window.from.slice(0, 10)}`
          : "All recorded history"}{" "}
        to {snapshot.window.asOf.slice(0, 10)} · UTC <AnalyticsLive />
      </p>
    </>
  );
}

function ClientAnalytics({
  snapshot,
}: {
  snapshot: AnalyticsSnapshot;
}): ReactElement {
  const c = snapshot.clients;
  const counts = [
    [c.totalClients, "Current clients created in period"],
    [c.activeClients, "With active projects now"],
    [c.archivedClients, "Archived clients created in period"],
  ];
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Relationships</p>
          <h2>Your client base</h2>
        </div>
        <Link href="/dashboard/clients">View clients ↗</Link>
      </div>
      <div className="analytics-inline-stats">
        {counts.map(([count, label]) => (
          <div key={label}>
            <strong>{count}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="analytics-note">
        Client counts exclude archived identities from current clients. Revenue
        retains their historical receipts under the same client identity.
      </p>
    </section>
  );
}

function ProjectAnalytics({
  snapshot,
}: {
  snapshot: AnalyticsSnapshot;
}): ReactElement {
  const p = snapshot.projects;
  const counts = [
    [p.totalProjects, "Total projects"],
    [p.completedProjects, "Accepted, including archived"],
    [`${p.completionRate.toFixed(1)}%`, "Completion rate"],
    [
      p.averageProjectDuration === null
        ? "—"
        : `${p.averageProjectDuration.toFixed(1)}d`,
      "Average creation to acceptance",
    ],
  ];
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Work in motion</p>
          <h2>Projects created in period</h2>
        </div>
        <Link href="/dashboard/projects">View projects ↗</Link>
      </div>
      <div className="analytics-inline-stats">
        {counts.map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <ProjectDistribution projects={p} />
      <p className="analytics-note">
        Current status of projects created in this period; deleted projects are
        excluded. Completion uses recorded client acceptance, including projects
        later archived. Duration runs from creation to first acceptance, not the
        last update.
      </p>
    </section>
  );
}

function ProjectDistribution({
  projects: p,
}: {
  projects: AnalyticsSnapshot["projects"];
}): ReactElement {
  return (
    <ul className="status-distribution">
      {[
        "draft",
        "pending_lockin",
        "active",
        "paused",
        "pending_approval",
        "completed",
        "archived",
      ].map((status) => {
        const count =
          p.projectsByStatus.find((r) => r.status === status)?.count ?? 0;
        return (
          <li key={status}>
            <span>{status.replaceAll("_", " ")}</span>
            <strong>{count}</strong>
            <meter
              min={0}
              max={p.totalProjects || 1}
              value={count}
              aria-label={`${status.replaceAll("_", " ")} projects`}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardView({
  snapshot,
  name,
}: {
  snapshot: AnalyticsSnapshot;
  name: string;
}): ReactElement {
  return (
    <div className="analytics-page dashboard-overview">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your studio, at a glance</p>
          <h1>Welcome, {name.split(" ")[0]}</h1>
          <p>A little clarity for the work ahead.</p>
        </div>
        <Link className="button" href="/dashboard/projects/new">
          New project <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <DashboardStats snapshot={snapshot} />
      <div className="overview-columns">
        <NeedsAttention snapshot={snapshot} />
        <ActiveProjects snapshot={snapshot} />
      </div>
      <MonthlyRevenue revenue={snapshot.revenue} lastSix />
      <RecentActivity snapshot={snapshot} />
      <p className="analytics-note">
        Current workspace ·{" "}
        <Link href="/dashboard/analytics">Explore analytics ↗</Link>{" "}
        <AnalyticsLive />
      </p>
    </div>
  );
}

function DashboardStats({
  snapshot: s,
}: {
  snapshot: AnalyticsSnapshot;
}): ReactElement {
  return (
    <div className="overview-stats">
      <Link href="/dashboard/analytics" className="card overview-stat">
        <span className="eyebrow">Revenue this month ↗</span>
        {s.revenue.currencies.length ? (
          s.revenue.currencies.map((r) => (
            <span className="overview-money" key={r.currency}>
              <strong>{analyticsMoney(r.thisMonth, r.currency)}</strong>
              <small>
                Previous month {analyticsMoney(r.lastMonth, r.currency)}
              </small>
              <small>{monthlyChange(r.thisMonth, r.lastMonth)}</small>
            </span>
          ))
        ) : (
          <strong>No receipts yet</strong>
        )}
        <small>Full receipts · UTC calendar month</small>
      </Link>
      <Link href="/dashboard/invoices" className="card overview-stat">
        <span className="eyebrow">Outstanding now ↗</span>
        {s.revenue.currencies.length ? (
          s.revenue.currencies.map((r) => (
            <span className="overview-money" key={r.currency}>
              <strong>{analyticsMoney(r.outstandingAmount, r.currency)}</strong>
              <small>
                {r.outstandingCount} unpaid · {r.overdueCount} overdue
              </small>
            </span>
          ))
        ) : (
          <strong>No unpaid invoices</strong>
        )}
      </Link>
      <Link
        href="/dashboard/projects?status=active"
        className="card overview-stat"
      >
        <span className="eyebrow">Active projects ↗</span>
        <strong className="stat-number">{s.overview.activeProjects}</strong>
        <small>Projects currently in progress</small>
      </Link>
      <a href="#needs-attention" className="card overview-stat">
        <span className="eyebrow">Unread messages ↓</span>
        <strong className="stat-number">{s.overview.unread.total}</strong>
        <small>Across current conversations</small>
      </a>
    </div>
  );
}

type AttentionItem = {
  id: string;
  href: string;
  label: string;
  name: string;
  priority: boolean;
};

function projectAttention(
  s: AnalyticsSnapshot,
  disputed: boolean,
): AttentionItem[] {
  return s.overview.projects
    .filter((p) =>
      disputed ? p.disputed : !p.disputed && p.status !== "active",
    )
    .map((p) => ({
      id: p.id,
      href: `/dashboard/projects/${p.id}${disputed ? "#messages" : ""}`,
      label: disputed
        ? "Changes requested"
        : p.status === "pending_lockin"
          ? "Awaiting scope agreement"
          : "Awaiting completion review",
      name: p.name,
      priority: disputed,
    }));
}

function unreadAttention(s: AnalyticsSnapshot): AttentionItem[] {
  return s.overview.unread.conversations
    .filter((c) => c.unread > 0)
    .map((c) => ({
      id: c.id,
      href:
        c.kind === "project"
          ? `/dashboard/projects/${c.id}#messages`
          : `/dashboard/clients/${c.id}#messages`,
      label: `${c.unread} unread messages`,
      name: c.name,
      priority: false,
    }));
}

function attentionItems(s: AnalyticsSnapshot): AttentionItem[] {
  return [
    ...projectAttention(s, true),
    ...s.overview.overdue.map((i) => ({
      id: i.id,
      href: `/dashboard/invoices/${i.id}`,
      label: `${i.days} days overdue · ${analyticsMoney(i.amount, i.currency)}`,
      name: `${i.number} · ${i.name}`,
      priority: true,
    })),
    ...projectAttention(s, false),
    ...unreadAttention(s),
  ];
}

function NeedsAttention({
  snapshot: s,
}: {
  snapshot: AnalyticsSnapshot;
}): ReactElement {
  const items = attentionItems(s);
  return (
    <section className="card attention-card" id="needs-attention">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Next steps</p>
          <h2>Needs attention</h2>
        </div>
        <span className="count-pill">
          {items.length}
          {s.overview.overdue.length === 10 ? "+" : ""}
        </span>
      </div>
      <AttentionList items={items} />
      <div className="section-links">
        <Link href="/dashboard/invoices">All invoices ↗</Link>
        <Link href="/dashboard/projects">All projects ↗</Link>
      </div>
      <p className="analytics-note">
        Up to 10 items; changes and overdue invoices first, then pending client
        decisions and unread messages.
      </p>
    </section>
  );
}

function AttentionList({ items }: { items: AttentionItem[] }): ReactElement {
  if (!items.length)
    return (
      <p className="analytics-empty">
        All clear. No overdue invoices, pending reviews, changes or unread
        messages.
      </p>
    );
  return (
    <ul className="attention-list">
      {items.slice(0, 10).map((item) => (
        <li key={`${item.id}-${item.label}`}>
          <Link href={item.href}>
            <span
              className={
                item.priority ? "attention-dot urgent" : "attention-dot"
              }
              aria-hidden="true"
            />
            <span>
              <small>{item.label}</small>
              <strong>{item.name}</strong>
            </span>
            <span aria-hidden="true">↗</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ActiveProjects({
  snapshot: s,
}: {
  snapshot: AnalyticsSnapshot;
}): ReactElement {
  const active = s.overview.projects
    .filter((p) => p.status === "active")
    .slice(0, 5);
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">On the desk</p>
          <h2>Active projects</h2>
        </div>
        <Link href="/dashboard/projects?status=active">View all ↗</Link>
      </div>
      {!active.length ? (
        <p className="analytics-empty">
          No active projects. Your next agreed scope will appear here.
        </p>
      ) : (
        <ul className="active-projects">
          {active.map((p) => (
            <li key={p.id}>
              <Link href={`/dashboard/projects/${p.id}`}>
                <strong>{p.name}</strong>
                <span>{p.clientName}</span>
                <progress
                  value={p.approved}
                  max={p.milestones || 1}
                  aria-label={`${p.name}: ${p.approved} of ${p.milestones} milestones approved`}
                />
                <small>
                  {p.approved} / {p.milestones} approved
                  {p.dueDate ? ` · Due ${p.dueDate}` : " · No due date"}
                  {` · ${s.overview.unread.conversations.find((c) => c.kind === "project" && c.id === p.id)?.unread ?? 0} unread`}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentActivity({
  snapshot: s,
}: {
  snapshot: AnalyticsSnapshot;
}): ReactElement {
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">The latest</p>
          <h2>Recent activity</h2>
        </div>
        <span className="field-help">Last 15 recorded events</span>
      </div>
      {!s.overview.activity.length ? (
        <p className="analytics-empty">
          Your client and project activity will appear here.
        </p>
      ) : (
        <ol className="overview-activity">
          {s.overview.activity.map((a) => (
            <li key={a.id}>
              <span className="activity-mark" aria-hidden="true">
                ↗
              </span>
              <Link href={a.href}>
                <strong>{activityLabel(a.event)}</strong>
                <span>{a.name}</span>
              </Link>
              <time dateTime={a.at}>
                {new Date(a.at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
