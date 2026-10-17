import { describe, expect, it } from "vitest";
import { assertIsolatedTestEnvironment } from "./fixture";

const fixture = {
  TEST_ISOLATED_DATABASE: "1",
  DATABASE_URL:
    "postgres://runtime:synthetic@localhost:55434/yinsen_test_task12",
  MIGRATION_DATABASE_URL:
    "postgres://migrator:synthetic@localhost:55434/yinsen_test_task12",
};

describe("mutable test target safety", () => {
  it("accepts an explicit uniquely named matched synthetic target", () => {
    expect(() => assertIsolatedTestEnvironment(fixture)).not.toThrow();
  });
  it("rejects the preserved database even when the isolation flag is set", () => {
    expect(() =>
      assertIsolatedTestEnvironment({
        ...fixture,
        DATABASE_URL: fixture.DATABASE_URL.replace(
          "yinsen_test_task12",
          "yinsen",
        ),
      }),
    ).toThrow("uniquely named");
    expect(() =>
      assertIsolatedTestEnvironment({
        ...fixture,
        TEST_ISOLATED_DATABASE: undefined,
      }),
    ).toThrow("TEST_ISOLATED_DATABASE");
  });
  it("rejects mismatched runtime/migrator database and server selections", () => {
    expect(() =>
      assertIsolatedTestEnvironment({
        ...fixture,
        MIGRATION_DATABASE_URL: fixture.MIGRATION_DATABASE_URL.replace(
          "yinsen_test_task12",
          "yinsen_test_other",
        ),
      }),
    ).toThrow("same synthetic database");
    expect(() =>
      assertIsolatedTestEnvironment({
        ...fixture,
        MIGRATION_DATABASE_URL: fixture.MIGRATION_DATABASE_URL.replace(
          "55434",
          "55432",
        ),
      }),
    ).toThrow("same synthetic server");
  });
});
