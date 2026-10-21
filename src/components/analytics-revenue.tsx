import type { ReactElement } from "react";
import Link from "next/link";
import type {
  AnalyticsSnapshot,
  ClientRevenue,
  CurrencyRevenue,
} from "../lib/analytics/queries";
import {
  analyticsMoney,
  barPercent,
  monthLabel,
} from "../lib/analytics/format";

export function MonthlyRevenue({
  revenue,
  lastSix = false,
}: {
  revenue: AnalyticsSnapshot["revenue"];
  lastSix?: boolean;
}): ReactElement {
  return (
    <section className="card revenue-chart" aria-label="Monthly revenue">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Money received</p>
          <h2>Revenue by month</h2>
        </div>
        <span className="field-help">
          {lastSix ? "Last 6 months · UTC" : "Selected period · UTC"}
        </span>
      </div>
      {!revenue.currencies.length && (
        <p className="analytics-empty">
          Your first received payment will appear here.
        </p>
      )}
      {revenue.currencies.map(({ currency }) => (
        <CurrencyMonths
          key={currency}
          currency={currency}
          months={revenue.revenueByMonth.filter((m) => m.currency === currency)}
          lastSix={lastSix}
        />
      ))}
    </section>
  );
}

function CurrencyMonths({
  currency,
  months,
  lastSix,
}: {
  currency: string;
  months: AnalyticsSnapshot["revenue"]["revenueByMonth"];
  lastSix: boolean;
}): ReactElement {
  const values = lastSix ? months.slice(-6) : months;
  const maximum = values.reduce(
    (max, m) => (BigInt(m.amount) > BigInt(max) ? m.amount : max),
    "0",
  );
  return (
    <div className="currency-chart">
      <h3>{currency}</h3>
      <ol className="monthly-bars">
        {values.map((m) => (
          <li key={m.month}>
            <span className="month-name">{monthLabel(m.month)}</span>
            <span className="bar-track" aria-hidden="true">
              <span style={{ width: `${barPercent(m.amount, maximum)}%` }} />
            </span>
            <strong>{analyticsMoney(m.amount, currency)}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RevenueStats({
  snapshot,
}: {
  snapshot: AnalyticsSnapshot;
}): ReactElement {
  return (
    <section className="analytics-currency-stats" aria-label="Revenue totals">
      {!snapshot.revenue.currencies.length && (
        <div className="card analytics-empty">
          <h2>No invoice activity yet</h2>
          <p>
            Send an invoice and record a full payment to start your revenue
            history.
          </p>
          <Link href="/dashboard/invoices/new">Create an invoice ↗</Link>
        </div>
      )}
      {snapshot.revenue.currencies.map((r) => (
        <CurrencySummary key={r.currency} revenue={r} />
      ))}
    </section>
  );
}

function CurrencySummary({
  revenue: r,
}: {
  revenue: CurrencyRevenue;
}): ReactElement {
  const details = [
    ["Received invoices", String(r.paidInvoiceCount)],
    [
      "Average received invoice",
      analyticsMoney(r.averageInvoiceValue, r.currency),
    ],
    [
      `Outstanding now · ${r.outstandingCount}`,
      analyticsMoney(r.outstandingAmount, r.currency),
    ],
    [
      `Overdue now · ${r.overdueCount}`,
      analyticsMoney(r.overdueAmount, r.currency),
    ],
  ];
  return (
    <div className="card currency-summary">
      <p className="eyebrow">{r.currency} · money received in period</p>
      <strong className="revenue-total">
        {analyticsMoney(r.totalRevenue, r.currency)}
      </strong>
      <dl className="revenue-details">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ClientRevenueTable({
  rows,
  title,
}: {
  rows: ClientRevenue[];
  title: string;
}): ReactElement {
  return (
    <section className="card client-revenue">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="field-help">Ranked within each currency</span>
      </div>
      {!rows.length ? (
        <p className="analytics-empty">No received payments in this period.</p>
      ) : (
        <div className="table-wrap">
          <table className="client-table">
            <caption className="sr-only">
              {title}, with currencies kept separate
            </caption>
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Received</th>
                <th scope="col">Invoices</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ClientRevenueRow
                  key={`${row.id}-${row.currency}`}
                  row={row}
                  maximum={
                    rows.find((r) => r.currency === row.currency)?.amount ?? "0"
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ClientRevenueRow({
  row,
  maximum,
}: {
  row: ClientRevenue;
  maximum: string;
}): ReactElement {
  return (
    <tr>
      <td>
        <Link href={`/dashboard/clients/${row.id}`}>{row.name}</Link>
        <small>
          {row.email}
          {row.archived ? " · Archived" : ""}
        </small>
      </td>
      <td>
        {analyticsMoney(row.amount, row.currency)}
        <span className="client-revenue-bar" aria-hidden="true">
          <span style={{ width: `${barPercent(row.amount, maximum)}%` }} />
        </span>
      </td>
      <td>{row.invoiceCount}</td>
    </tr>
  );
}
