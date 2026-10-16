import assert from "node:assert/strict";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3000";
const health = await fetch(`${origin}/api/health`);
assert.equal(health.status, 200);
assert.equal(health.headers.get("x-frame-options"), "DENY");
assert.equal(health.headers.get("x-content-type-options"), "nosniff");
assert.equal(health.headers.get("cache-control"), "no-store");
assert.match(health.headers.get("x-request-id") ?? "", /^[\da-f-]{36}$/);
const body: unknown = await health.json();
assert.deepEqual(body, {
  data: { status: "healthy", version: "0.1.0" },
  meta: null,
  error: null,
});
const page = await fetch(origin);
assert.equal(page.status, 200);
assert.match(await page.text(), /Your client portal/);
process.stdout.write(`Installed HTTP foundation passed: ${origin}\n`);
