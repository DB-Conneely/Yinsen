import { z } from "zod";
import { ConfigurationError } from "./errors";

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.url(),
  DATABASE_SSL: z.enum(["disable", "verify-full"]).default("verify-full"),
});

export type Configuration = {
  databaseUrl: string;
  origin: string;
  ssl: false | { rejectUnauthorized: true };
};

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
  };
}
