import type postgres from "postgres";
import { getSql } from "../db/client";
import { operatorOnly, type ProjectActor } from "../projects/access";
import { messageSummary } from "../messages/queries";
import { analyticsWindow, type AnalyticsWindow } from "./period";

type Sql = postgres.TransactionSql;
export type CurrencyRevenue = {
  currency: string;
  totalRevenue: string;
  outstandingAmount: string;
  overdueAmount: string;
  paidInvoiceCount: number;
  outstandingCount: number;
  overdueCount: number;
  averageInvoiceValue: string;
  thisMonth: string;
  lastMonth: string;
};
export type ClientRevenue = {
  id: string;
  name: string;
  email: string;
  archived: boolean;
  currency: string;
  amount: string;
  invoiceCount: number;
};
type ProjectStats = {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  averageProjectDuration: number | null;
  completionRate: number;
  projectsByStatus: { status: string; count: number }[];
};
type ClientStats = {
  totalClients: number;
  activeClients: number;
  archivedClients: number;
  topClients: ClientRevenue[];
};
export type OverviewProject = {
  id: string;
  name: string;
  clientName: string;
  status: string;
  dueDate: string | null;
  milestones: number;
  approved: number;
  disputed: boolean;
};
type Activity = {
  id: string;
  name: string;
  href: string;
  event: string;
  at: string;
};
type AttentionInvoice = {
  id: string;
  number: string;
  name: string;
  currency: string;
  amount: string;
  days: number;
};
export type AnalyticsSnapshot = {
  window: AnalyticsWindow;
  revenue: {
    currencies: CurrencyRevenue[];
    revenueByMonth: { month: string; currency: string; amount: string }[];
    revenueByClient: ClientRevenue[];
  };
  projects: ProjectStats;
  clients: ClientStats;
  overview: {
    projects: OverviewProject[];
    activity: Activity[];
    overdue: AttentionInvoice[];
    unread: Awaited<ReturnType<typeof messageSummary>>;
    activeProjects: number;
  };
};

async function revenueTotals(
  sql: Sql,
  w: AnalyticsWindow,
): Promise<CurrencyRevenue[]> {
  return sql<CurrencyRevenue[]>`with facts as (
    select *, coalesce(total_override,amount)::bigint as total,
      (paid_at>=${w.from}::timestamptz or ${w.from}::timestamptz is null) and paid_at<${w.asOf}::timestamptz as in_period,
      status in ('sent','overdue') and deleted_at is null as unpaid
    from invoices where status in ('paid','settled') or deleted_at is null
  ) select currency,
    coalesce(sum(total) filter(where in_period),0)::text as "totalRevenue",
    coalesce(sum(total) filter(where unpaid),0)::text as "outstandingAmount",
    coalesce(sum(total) filter(where unpaid and due_date<(${w.asOf}::timestamptz at time zone 'UTC')::date),0)::text as "overdueAmount",
    count(*) filter(where in_period)::int as "paidInvoiceCount",
    count(*) filter(where unpaid)::int as "outstandingCount",
    count(*) filter(where unpaid and due_date<(${w.asOf}::timestamptz at time zone 'UTC')::date)::int as "overdueCount",
    coalesce(round(avg(total) filter(where in_period)),0)::text as "averageInvoiceValue",
    coalesce(sum(total) filter(where paid_at>=date_trunc('month',${w.asOf}::timestamptz at time zone 'UTC') at time zone 'UTC' and paid_at<${w.asOf}::timestamptz),0)::text as "thisMonth",
    coalesce(sum(total) filter(where paid_at>=(date_trunc('month',${w.asOf}::timestamptz at time zone 'UTC')-interval '1 month') at time zone 'UTC' and paid_at<date_trunc('month',${w.asOf}::timestamptz at time zone 'UTC') at time zone 'UTC'),0)::text as "lastMonth"
    from facts group by currency order by currency`;
}

async function revenueMonths(
  sql: Sql,
  w: AnalyticsWindow,
): Promise<AnalyticsSnapshot["revenue"]["revenueByMonth"]> {
  return sql`with paid as (
    select currency,coalesce(total_override,amount)::bigint as amount,paid_at from invoices
    where status in ('paid','settled') and (${w.from}::timestamptz is null or paid_at>=${w.from}::timestamptz) and paid_at<${w.asOf}::timestamptz
  ), months as (
    select generate_series(date_trunc('month',coalesce(${w.from}::timestamptz,(select min(paid_at) from paid),${w.asOf}::timestamptz) at time zone 'UTC'),date_trunc('month',${w.asOf}::timestamptz at time zone 'UTC'),interval '1 month') as month
  ), currencies as (select distinct currency from invoices where status in ('paid','settled') or deleted_at is null)
  select to_char(m.month,'YYYY-MM') as month,c.currency,coalesce(sum(p.amount),0)::text as amount
  from months m cross join currencies c left join paid p on p.currency=c.currency and date_trunc('month',p.paid_at at time zone 'UTC')=m.month
  group by m.month,c.currency order by m.month,c.currency`;
}

async function revenueClients(
  sql: Sql,
  w: AnalyticsWindow,
): Promise<ClientRevenue[]> {
  return sql`select c.id,c.name,c.email,(c.deleted_at is not null) as archived,i.currency,
    sum(coalesce(i.total_override,i.amount)::bigint)::text as amount,count(*)::int as "invoiceCount"
    from invoices i join clients c on c.id=i.client_id where i.status in ('paid','settled')
    and (${w.from}::timestamptz is null or i.paid_at>=${w.from}::timestamptz) and i.paid_at<${w.asOf}::timestamptz
    group by c.id,i.currency order by i.currency,sum(coalesce(i.total_override,i.amount)::bigint) desc,c.id`;
}

async function projectStats(
  sql: Sql,
  w: AnalyticsWindow,
): Promise<ProjectStats> {
  const rows = await sql<
    { status: string; count: number; completed: number; days: number | null }[]
  >`
    select p.status,count(*)::int as count,count(a.at)::int as completed,
    avg(greatest(0,extract(epoch from (a.at-p.created_at))/86400)) filter(where a.at is not null)::float8 as days
    from projects p left join lateral (select min(created_at) as at from project_activity where project_id=p.id and event_type='project.accepted') a on true
    where p.deleted_at is null and (${w.from}::timestamptz is null or p.created_at>=${w.from}::timestamptz) and p.created_at<${w.asOf}::timestamptz
    group by p.status order by p.status`;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const completed = rows.reduce((sum, row) => sum + row.completed, 0);
  return {
    totalProjects: total,
    activeProjects: rows.find((r) => r.status === "active")?.count ?? 0,
    completedProjects: completed,
    averageProjectDuration: completed
      ? rows.reduce((sum, row) => sum + (row.days ?? 0) * row.completed, 0) /
        completed
      : null,
    completionRate: total ? (completed / total) * 100 : 0,
    projectsByStatus: rows.map(({ status, count }) => ({ status, count })),
  };
}

async function clientStats(
  sql: Sql,
  w: AnalyticsWindow,
  revenue: ClientRevenue[],
): Promise<ClientStats> {
  const rows = await sql<Omit<ClientStats, "topClients">[]>`select
    count(*) filter(where c.deleted_at is null)::int as "totalClients",
    count(*) filter(where c.deleted_at is null and exists(select 1 from project_clients pc join projects p on p.id=pc.project_id where pc.client_id=c.id and p.deleted_at is null and p.status='active'))::int as "activeClients",
    count(*) filter(where c.deleted_at is not null)::int as "archivedClients"
    from clients c where (${w.from}::timestamptz is null or c.created_at>=${w.from}::timestamptz) and c.created_at<${w.asOf}::timestamptz`;
  return {
    totalClients: 0,
    activeClients: 0,
    archivedClients: 0,
    ...rows[0],
    topClients: revenue.filter(
      (row, index) =>
        revenue.slice(0, index).filter((r) => r.currency === row.currency)
          .length < 5,
    ),
  };
}

async function overview(
  sql: Sql,
  actor: ProjectActor,
  w: AnalyticsWindow,
): Promise<AnalyticsSnapshot["overview"]> {
  const projects = await sql<
    OverviewProject[]
  >`select p.id,p.name,p.status,p.due_date::text as "dueDate",
    (select c.name from project_clients pc join clients c on c.id=pc.client_id where pc.project_id=p.id and pc.role='primary') as "clientName",
    (select count(*)::int from milestones m where m.project_id=p.id) as milestones,
    (select count(*)::int from milestones m where m.project_id=p.id and m.status='approved') as approved,
    coalesce((select event_type='project.disputed' from project_activity where project_id=p.id and event_type in ('project.disputed','project.submitted_for_approval','project.accepted') order by created_at desc,id desc limit 1),false) as disputed
    from projects p where p.deleted_at is null and p.status in ('active','paused','pending_lockin','pending_approval') order by p.due_date nulls last,p.name,p.id`;
  const overdue = await sql<
    AttentionInvoice[]
  >`select id,invoice_number as number,recipient_name as name,currency,coalesce(total_override,amount)::text as amount,
    ((${w.asOf}::timestamptz at time zone 'UTC')::date-due_date)::int as days
    from invoices where deleted_at is null and status in ('sent','overdue') and due_date<(${w.asOf}::timestamptz at time zone 'UTC')::date order by due_date,id limit 10`;
  const activity = await sql<Activity[]>`select * from (
    select a.id,p.name,'/dashboard/projects/'||p.id as href,a.event_type as event,a.created_at::text as at from project_activity a join projects p on p.id=a.project_id where p.deleted_at is null
    union all select a.id,c.name,'/dashboard/clients/'||c.id,a.event_type,a.created_at::text from activity_events a join clients c on c.id=a.client_id
  ) events order by at::timestamptz desc,id desc limit 15`;
  return {
    projects,
    overdue,
    activity,
    unread: await messageSummary(actor, sql),
    activeProjects: projects.filter((p) => p.status === "active").length,
  };
}

export async function readAnalytics(
  actor: ProjectActor,
  input?: unknown,
): Promise<AnalyticsSnapshot> {
  operatorOnly(actor);
  return getSql().begin(
    "isolation level repeatable read read only",
    async (sql) => {
      const time = await sql<
        { at: string }[]
      >`select transaction_timestamp()::text as at`;
      const window = analyticsWindow(input, new Date(time[0]?.at ?? ""));
      const currencies = await revenueTotals(sql, window);
      const revenueByMonth = await revenueMonths(sql, window);
      const revenueByClient = await revenueClients(sql, window);
      return {
        window,
        revenue: { currencies, revenueByMonth, revenueByClient },
        projects: await projectStats(sql, window),
        clients: await clientStats(sql, window, revenueByClient),
        overview: await overview(sql, actor, window),
      };
    },
  );
}
