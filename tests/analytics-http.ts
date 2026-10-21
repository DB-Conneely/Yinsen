import "./fixture";
import assert from "node:assert/strict";
import { z } from "zod";
import { getSql } from "../src/lib/db/client";
import { readConfiguration } from "../src/lib/config";

const origin = readConfiguration().origin;
const envelope = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string() }).nullable(),
});
const revenue = z.object({
  window: z.object({ asOf: z.string() }),
  currencies: z.array(
    z.object({
      currency: z.string(),
      totalRevenue: z.string(),
      paidInvoiceCount: z.number(),
      outstandingAmount: z.string(),
    }),
  ),
  revenueByMonth: z.array(
    z.object({ currency: z.string(), amount: z.string() }),
  ),
  revenueByClient: z.array(
    z.object({ currency: z.string(), amount: z.string() }),
  ),
});
async function call(
  path: string,
  cookie = "",
  input?: unknown,
): Promise<Response> {
  return fetch(origin + path, {
    method: input === undefined ? "GET" : "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}
async function data(response: Response, status = 200): Promise<unknown> {
  const body = envelope.parse(await response.json());
  assert.equal(response.status, status, JSON.stringify(body));
  return body.data;
}
async function compareMoney(cookie: string, period: string): Promise<void> {
  const result = revenue.parse(
    await data(await call(`/api/analytics/revenue?period=${period}`, cookie)),
  );
  for (const currency of result.currencies) {
    const months = result.revenueByMonth
      .filter((r) => r.currency === currency.currency)
      .reduce((sum, r) => sum + BigInt(r.amount), 0n);
    const clients = result.revenueByClient
      .filter((r) => r.currency === currency.currency)
      .reduce((sum, r) => sum + BigInt(r.amount), 0n);
    assert.equal(months, BigInt(currency.totalRevenue));
    assert.equal(clients, months);
  }
  if (period === "all") {
    const direct = await getSql()<
      { currency: string; amount: string; count: number }[]
    >`select currency,sum(coalesce(total_override,amount))::text as amount,count(*)::int as count from invoices where status in ('paid','settled') and paid_at<${result.window.asOf} group by currency`;
    for (const row of direct) {
      const actual = result.currencies.find((r) => r.currency === row.currency);
      assert.equal(actual?.totalRevenue, row.amount);
      assert.equal(actual.paidInvoiceCount, row.count);
    }
  }
}
try {
  const login = await call("/api/auth/login", "", {
    email: "operator@example.test",
    password: "remote-proof-password-12!",
  });
  await data(login);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const clients = z
    .object({ clients: z.array(z.object({ id: z.uuid() })) })
    .parse(await data(await call("/api/clients", cookie)));
  const id = clients.clients[0]?.id;
  assert.ok(id, "Use a fixture with a current client");
  const link = z
    .object({ url: z.url() })
    .parse(
      await data(await call(`/api/clients/${id}/generate-link`, cookie, {})),
    );
  const verify = await call("/api/auth/verify", "", {
    token: new URL(link.url).hash.slice(1),
  });
  await data(verify);
  const client = verify.headers.get("set-cookie")?.split(";")[0];
  assert.ok(client);
  for (const endpoint of ["revenue", "projects", "clients"]) {
    const path = "/api/analytics/" + endpoint;
    await data(await call(path), 401);
    await data(await call(path, "pylon_session=" + "f".repeat(64)), 401);
    await data(await call(path, client), 403);
    const response = await call(path + "?period=all", cookie);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    await data(response);
    await data(await call(path + "?period=invalid", cookie), 400);
  }
  for (const period of ["30d", "90d", "12m", "all"])
    await compareMoney(cookie, period);
  const page = await call("/dashboard/analytics?period=all", cookie);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("Revenue by client"));
  process.stdout.write(
    "Installed analytics APIs/pages, exact SQL money and chart/client sums, periods and anonymous/unknown/client isolation pass.\n",
  );
} finally {
  await getSql().end();
}
