import { describe, expect, it } from "vitest";
import { databaseConnection, readConfiguration } from "../src/lib/config";
import {
  AppError,
  ConfigurationError,
  DatabaseError,
  SchemaError,
} from "../src/lib/errors";

const valid = {
  DATABASE_URL: "postgresql://runtime:secret@localhost:5432/yinsen",
  DATABASE_SSL: "disable",
  APP_ORIGIN: "http://localhost:3000",
};

describe("configuration trust boundary", () => {
  it("accepts local configuration and normalizes the origin", () => {
    expect(readConfiguration(valid)).toEqual({
      databaseUrl: valid.DATABASE_URL,
      ssl: false,
      origin: valid.APP_ORIGIN,
    });
  });
  it("requires TLS with certificate verification remotely", () => {
    expect(
      databaseConnection(
        "postgres://runtime:secret@db.example.com/yinsen",
        "verify-full",
      ).ssl,
    ).toEqual({ rejectUnauthorized: true });
    expect(() =>
      databaseConnection(
        "postgres://runtime:secret@db.example.com/yinsen",
        "disable",
      ),
    ).toThrow(ConfigurationError);
  });
  it.each([
    "",
    "invalid",
    "https://runtime:secret@localhost/yinsen",
    "postgres://localhost/yinsen",
    "postgres://a:b@localhost/",
    "postgres://a:b@localhost/yinsen?sslmode=disable",
  ])("rejects invalid database URL without echoing secrets: %s", (url) => {
    expect(() => databaseConnection(url, "disable")).toThrow(
      ConfigurationError,
    );
  });
  it.each([
    "http://remote.example.com",
    "https://remote.example.com/path",
    "https://user:secret@example.com",
    "https://example.com?secret=value",
    "ftp://example.com",
    "bad",
  ])("rejects unsafe origin: %s", (origin) => {
    expect(() => readConfiguration({ ...valid, APP_ORIGIN: origin })).toThrow(
      ConfigurationError,
    );
  });
  it("reports variable names without secret values", () => {
    expect(() => readConfiguration({ APP_ORIGIN: "secret-value" })).toThrow(
      "DATABASE_URL, APP_ORIGIN",
    );
  });
  it("defaults to verified TLS", () => {
    expect(
      readConfiguration({
        DATABASE_URL: valid.DATABASE_URL,
        APP_ORIGIN: "https://portal.example.com",
      }).ssl,
    ).toEqual({ rejectUnauthorized: true });
  });
});

describe("safe typed failures", () => {
  it("preserves the declared HTTP error contract", () => {
    const error = new AppError(409, "CONFLICT", "Already completed");
    expect(error).toBeInstanceOf(Error);
    expect([error.statusCode, error.code, error.message]).toEqual([
      409,
      "CONFLICT",
      "Already completed",
    ]);
    expect(new DatabaseError().statusCode).toBe(503);
    expect(new SchemaError().message).toContain("db:migrate");
    expect(new ConfigurationError("Missing APP_ORIGIN").code).toBe(
      "CONFIGURATION_ERROR",
    );
  });
});
