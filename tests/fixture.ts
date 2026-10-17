import assert from "node:assert/strict";

export function assertIsolatedTestEnvironment(
  environment: Record<string, string | undefined>,
): void {
  assert.equal(
    environment.TEST_ISOLATED_DATABASE,
    "1",
    "Set TEST_ISOLATED_DATABASE=1 for a deliberate synthetic fixture.",
  );
  const runtime = new URL(environment.DATABASE_URL ?? "invalid");
  const migrator = new URL(environment.MIGRATION_DATABASE_URL ?? "invalid");
  assert.match(
    runtime.pathname,
    /^\/yinsen_test_[a-z0-9_]+$/,
    "Tests require a uniquely named yinsen_test_* database; the preserved installation is never a test target.",
  );
  assert.equal(
    migrator.pathname,
    runtime.pathname,
    "Runtime/migrator must target the same synthetic database.",
  );
  assert.equal(
    migrator.host,
    runtime.host,
    "Runtime/migrator must target the same synthetic server.",
  );
}

// Runs before test-module imports, connections or writes, including legacy foundation tests.
assertIsolatedTestEnvironment(process.env);
