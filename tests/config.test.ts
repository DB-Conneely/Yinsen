import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
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
      storage: {
        driver: "local",
        path: resolve("data/uploads"),
        maxBytes: 104857600,
      },
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
  it("validates consumed local, S3 and R2 storage without exposing credentials", () => {
    const cloud = {
      ...valid,
      STORAGE_DRIVER: "s3",
      STORAGE_S3_BUCKET: "private-files",
      STORAGE_S3_REGION: "auto",
      STORAGE_S3_ACCESS_KEY: "synthetic-access",
      STORAGE_S3_SECRET_KEY: "synthetic-secret",
      STORAGE_S3_ENDPOINT: "https://synthetic.r2.cloudflarestorage.com",
    };
    expect(readConfiguration(cloud).storage.driver).toBe("s3");
    expect(
      readConfiguration({ ...cloud, STORAGE_S3_ENDPOINT: "" }).storage.driver,
    ).toBe("s3");
    expect(() =>
      readConfiguration({ ...cloud, STORAGE_S3_SECRET_KEY: "" }),
    ).toThrow("requires");
    expect(() =>
      readConfiguration({ ...cloud, STORAGE_DRIVER: "local" }),
    ).toThrow("requires STORAGE_DRIVER=s3");
    expect(() =>
      readConfiguration({
        ...cloud,
        STORAGE_S3_ENDPOINT: "https://user:secret@example.com",
      }),
    ).toThrow("HTTPS origin");
    expect(() =>
      readConfiguration({ ...valid, MAX_UPLOAD_SIZE_MB: "101" }),
    ).toThrow("MAX_UPLOAD_SIZE_MB");
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
