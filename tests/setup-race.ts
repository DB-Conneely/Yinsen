import assert from "node:assert/strict";
import "./fixture";
import postgres from "postgres";
import { readConfiguration } from "../src/lib/config";

assert.equal(
  process.env.TEST_ISOLATED_DATABASE,
  "1",
  "Use a deliberately isolated synthetic database.",
);
const configuration = readConfiguration();
const sql = postgres(configuration.databaseUrl, {
  ssl: configuration.ssl,
  max: 1,
});
const origin = configuration.origin;
const input = {
  name: "Race Operator",
  email: " RACE@EXAMPLE.TEST ",
  password: "race unique password 12!",
  brandName: "Race Studio",
  brandColour: "#664422",
  defaultCurrency: "GBP",
};
async function setup(): Promise<Response> {
  return fetch(`${origin}/api/setup`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
try {
  assert.equal(
    (await sql`select id from operator`).length,
    0,
    "The setup-race check requires an untouched empty operator table; it never resets data.",
  );
  assert.equal((await sql`select singleton from settings`).length, 0);
  assert.equal(
    (await fetch(`${origin}/api/setup`)).status,
    200,
    "Await the ordinary installed application's readiness first.",
  );
  const responses = await Promise.all([setup(), setup()]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal((await setup()).status, 409);
  assert.equal((await fetch(`${origin}/setup`)).status, 404);
  const operators = await sql<{ email: string }[]>`select email from operator`;
  assert.deepEqual(
    operators.map((row) => row.email),
    ["race@example.test"],
  );
  assert.equal((await sql`select singleton from settings`).length, 1);
  assert.equal((await sql`select token_hash from operator_sessions`).length, 1);
  process.stdout.write(
    `Installed fresh setup race passed: ${origin}; concurrent 200/409, repeated409, page404, one operator/settings/session.\n`,
  );
} finally {
  await sql.end();
}
