import { z } from "zod";
import { ConfigurationError } from "./errors";
import { resolve } from "node:path";

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.url(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  DATABASE_SSL: z.enum(["disable", "verify-full"]).default("verify-full"),
  RESEND_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^re_[A-Za-z0-9_-]+$/)
      .optional(),
  ),
  EMAIL_FROM_ADDRESS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.email().max(254).toLowerCase().optional(),
  ),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().min(1).default("./data/uploads"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(100).default(100),
});

export type StorageConfiguration =
  | { driver: "local"; path: string; maxBytes: number }
  | {
      driver: "s3";
      path: string;
      maxBytes: number;
      bucket: string;
      region: string;
      endpoint?: string;
      accessKeyId: string;
      secretAccessKey: string;
    };

export type Configuration = {
  databaseUrl: string;
  origin: string;
  ssl: false | { rejectUnauthorized: true };
  email?: { key: string; from: string };
  stripe?: { key: string; webhookSecret: string };
  storage: StorageConfiguration;
};

function storageConfiguration(
  environment: Record<string, string | undefined>,
  driver: "local" | "s3",
  path: string,
  maxBytes: number,
): StorageConfiguration {
  const fields = ["BUCKET", "REGION", "ACCESS_KEY", "SECRET_KEY"] as const;
  const supplied = fields.some((key) => environment[`STORAGE_S3_${key}`]);
  if (driver === "local") {
    if (supplied || environment.STORAGE_S3_ENDPOINT)
      throw new ConfigurationError(
        "S3 configuration requires STORAGE_DRIVER=s3. See .env.example.",
      );
    return { driver, path: resolve(path), maxBytes };
  }
  const parsed = z
    .object({
      STORAGE_S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
      STORAGE_S3_REGION: z.string().regex(/^[a-z0-9-]+$/),
      STORAGE_S3_ACCESS_KEY: z.string().min(1),
      STORAGE_S3_SECRET_KEY: z.string().min(1),
    })
    .safeParse(environment);
  if (!parsed.success)
    throw new ConfigurationError(
      "S3 storage requires bucket, region, access key and secret key together. See .env.example.",
    );
  const endpoint = environment.STORAGE_S3_ENDPOINT || undefined;
  if (endpoint) {
    const url = z.url().safeParse(endpoint);
    if (!url.success)
      throw new ConfigurationError("Invalid STORAGE_S3_ENDPOINT.");
    const target = new URL(url.data);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
    if (
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      target.pathname !== "/" ||
      (target.protocol !== "https:" && !(local && target.protocol === "http:"))
    )
      throw new ConfigurationError(
        "STORAGE_S3_ENDPOINT must be an HTTPS origin (localhost HTTP is allowed for private development).",
      );
  }
  return {
    driver,
    path: resolve(path),
    maxBytes,
    bucket: parsed.data.STORAGE_S3_BUCKET,
    region: parsed.data.STORAGE_S3_REGION,
    accessKeyId: parsed.data.STORAGE_S3_ACCESS_KEY,
    secretAccessKey: parsed.data.STORAGE_S3_SECRET_KEY,
    ...(endpoint ? { endpoint } : {}),
  };
}

export function databaseConnection(
  url: string,
  mode: string,
): Pick<Configuration, "databaseUrl" | "ssl"> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConfigurationError(
      "Database URL must be a valid PostgreSQL URL.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.username ||
    !parsed.password ||
    parsed.pathname.length < 2 ||
    parsed.search ||
    parsed.hash
  ) {
    throw new ConfigurationError(
      "Database URL requires PostgreSQL credentials and a database name, without query parameters.",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]", "postgres"].includes(
    parsed.hostname,
  );
  if (mode !== "verify-full" && (mode !== "disable" || !local)) {
    throw new ConfigurationError(
      "Database TLS verification is required outside localhost or the private Compose postgres service.",
    );
  }
  return {
    databaseUrl: url,
    ssl: mode === "disable" ? false : { rejectUnauthorized: true },
  };
}

export function readConfiguration(
  environment: Record<string, string | undefined> = process.env,
): Configuration {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    throw new ConfigurationError(
      `Invalid configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}. See .env.example.`,
    );
  }
  const origin = new URL(result.data.APP_ORIGIN);
  const stripeKey = result.data.STRIPE_SECRET_KEY || undefined;
  const webhookSecret = result.data.STRIPE_WEBHOOK_SECRET || undefined;
  if ((stripeKey || webhookSecret) && !(stripeKey && webhookSecret))
    throw new ConfigurationError(
      "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET together, or omit both. See .env.example.",
    );
  if (
    stripeKey &&
    (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(stripeKey) ||
      !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret ?? ""))
  )
    throw new ConfigurationError(
      "Invalid Stripe server configuration. See .env.example.",
    );
  const { RESEND_API_KEY: key, EMAIL_FROM_ADDRESS: from } = result.data;
  if ((key || from) && !(key && from))
    throw new ConfigurationError(
      "Set RESEND_API_KEY and EMAIL_FROM_ADDRESS together, or omit both. See .env.example.",
    );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    (origin.protocol !== "https:" && !(local && origin.protocol === "http:"))
  ) {
    throw new ConfigurationError(
      "APP_ORIGIN must be an HTTPS origin, or localhost HTTP for local development.",
    );
  }
  return {
    ...databaseConnection(result.data.DATABASE_URL, result.data.DATABASE_SSL),
    origin: origin.origin,
    ...(key && from ? { email: { key, from } } : {}),
    ...(stripeKey && webhookSecret
      ? { stripe: { key: stripeKey, webhookSecret } }
      : {}),
    storage: storageConfiguration(
      environment,
      result.data.STORAGE_DRIVER,
      result.data.STORAGE_LOCAL_PATH,
      result.data.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    ),
  };
}
