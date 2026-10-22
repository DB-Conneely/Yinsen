import assert from "node:assert/strict";
import { releaseIdentitySchema } from "../src/lib/release";
import { z } from "zod";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3000";
const health = await fetch(`${origin}/api/health`);
assert.equal(health.status, 200);
assert.equal(health.headers.get("x-frame-options"), "DENY");
assert.equal(health.headers.get("x-content-type-options"), "nosniff");
assert.equal(
  health.headers.get("strict-transport-security"),
  "max-age=31536000",
);
assert.equal(health.headers.get("cache-control"), "no-store");
assert.match(health.headers.get("x-request-id") ?? "", /^[\da-f-]{36}$/);
const body: unknown = await health.json();
const result = z
  .object({
    data: z.object({
      status: z.literal("healthy"),
      version: z.string(),
      release: releaseIdentitySchema,
    }),
    meta: z.null(),
    error: z.null(),
  })
  .parse(body);
assert.equal(result.data.version, result.data.release.version);
const page = await fetch(origin);
assert.equal(page.status, 200);
assert.equal(page.headers.get("strict-transport-security"), "max-age=31536000");
assert.match(await page.text(), /Your client portal|Set up your portal/);
process.stdout.write(`Installed HTTP foundation passed: ${origin}\n`);
