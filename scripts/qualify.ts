import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { artifactSetSchema, releaseIdentitySchema } from "../src/lib/release";
import { qualificationCommand } from "./qualification-command";

const directory = resolve(process.env.PACKAGE_DIRECTORY ?? ".local/package");
const artifactsPath = `${directory}/artifacts.json`;
const artifacts = artifactSetSchema.parse(
  JSON.parse(readFileSync(artifactsPath, "utf8")),
);
const suffix = randomBytes(6).toString("hex");
if (existsSync(`${directory}/qualification.json`))
  renameSync(
    `${directory}/qualification.json`,
    `${directory}/qualification-previous-${suffix}.json`,
  );
const project = `yinsen_qualification_${suffix}`;
const fixture = `${directory}/qualification-${suffix}`;
mkdirSync(fixture, { recursive: true, mode: 0o700 });
const appPort = Number(process.env.QUALIFICATION_APP_PORT ?? "3211");
const postgresPort = Number(process.env.QUALIFICATION_POSTGRES_PORT ?? "55451");
assert.ok(
  [appPort, postgresPort].every(
    (port) => Number.isInteger(port) && port > 1024 && port < 65536,
  ),
);
const origin = `http://localhost:${appPort}`;
const database = `yinsen_test_package_${suffix}`;
const env = {
  ...process.env,
  POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
  MIGRATION_PASSWORD: randomBytes(32).toString("hex"),
  RUNTIME_PASSWORD: randomBytes(32).toString("hex"),
  POSTGRES_DB: database,
  POSTGRES_PORT: String(postgresPort),
  APP_PORT: String(appPort),
  APP_ORIGIN: origin,
  TEST_ORIGIN: origin,
  TEST_ISOLATED_DATABASE: "1",
  DATABASE_SSL: "disable",
  RESEND_API_KEY: "",
  EMAIL_FROM_ADDRESS: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  STORAGE_DRIVER: "local",
  MAX_UPLOAD_SIZE_MB: "1",
  STORAGE_LOCAL_PATH: `${fixture}/uploads`,
  STORAGE_S3_BUCKET: "",
  STORAGE_S3_REGION: "",
  STORAGE_S3_ENDPOINT: "",
  STORAGE_S3_ACCESS_KEY: "",
  STORAGE_S3_SECRET_KEY: "",
  YINSEN_RUNTIME_IMAGE: artifacts.runtime.id,
  YINSEN_TOOLS_IMAGE: artifacts.tools.id,
};
const envPath = `${fixture}/installation.env`;
const installationKeys = [
  "POSTGRES_PASSWORD",
  "MIGRATION_PASSWORD",
  "RUNTIME_PASSWORD",
  "POSTGRES_DB",
  "POSTGRES_PORT",
  "APP_PORT",
  "APP_ORIGIN",
  "DATABASE_SSL",
  "STORAGE_DRIVER",
  "MAX_UPLOAD_SIZE_MB",
  "STORAGE_LOCAL_PATH",
  "YINSEN_RUNTIME_IMAGE",
  "YINSEN_TOOLS_IMAGE",
  "RESEND_API_KEY",
  "EMAIL_FROM_ADDRESS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STORAGE_S3_BUCKET",
  "STORAGE_S3_REGION",
  "STORAGE_S3_ENDPOINT",
  "STORAGE_S3_ACCESS_KEY",
  "STORAGE_S3_SECRET_KEY",
];
writeFileSync(
  envPath,
  Object.entries(env)
    .filter(([key]) => installationKeys.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
const compose = [
  "compose",
  "--env-file",
  envPath,
  "-p",
  project,
  "-f",
  "compose.yaml",
  "-f",
  "compose.release.yaml",
];
let command = 0;
function run(
  program: string,
  args: string[],
  environment: NodeJS.ProcessEnv = env,
): string {
  const logfile = `${fixture}/${String(++command).padStart(2, "0")}-${program}.log`;
  const output = qualificationCommand(program, args, environment, logfile);
  process.stdout.write(
    `Qualification ${command}: ${program} ${args.includes("check") ? "check" : "stage"} passed.\n`,
  );
  return output;
}
function connection(db: string): NodeJS.ProcessEnv {
  return {
    ...env,
    POSTGRES_DB: db,
    DATABASE_URL: `postgresql://yinsen_runtime:${env.RUNTIME_PASSWORD}@127.0.0.1:${postgresPort}/${db}`,
    MIGRATION_DATABASE_URL: `postgresql://yinsen_migrator:${env.MIGRATION_PASSWORD}@127.0.0.1:${postgresPort}/${db}`,
  };
}
function create(db: string): void {
  assert.match(db, /^yinsen_test_[a-z0-9_]+$/);
  run("docker", [
    ...compose,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    database,
    "-c",
    `CREATE DATABASE ${db} OWNER yinsen_migrator`,
  ]);
  run("docker", [
    ...compose,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    db,
    "-f",
    "/docker-entrypoint-initdb.d/database-permissions.psql",
  ]);
}
function migrate(db: string): void {
  const environment = {
    ...connection(db),
    MIGRATION_DATABASE_URL: `postgresql://yinsen_migrator:${env.MIGRATION_PASSWORD}@postgres:5432/${db}`,
  };
  run(
    "docker",
    [
      ...compose,
      "run",
      "--rm",
      "--no-deps",
      "-e",
      "MIGRATION_DATABASE_URL",
      "migrate",
    ],
    environment,
  );
}
async function inspectLive(db: string): Promise<void> {
  const container = run(
    "docker",
    [...compose, "ps", "-q", "app"],
    connection(db),
  ).trim();
  assert.ok(container);
  assert.equal(
    run("docker", ["inspect", "--format", "{{.Image}}", container]).trim(),
    artifacts.runtime.id,
  );
  const response = await fetch(origin + "/api/health");
  assert.equal(response.status, 200);
  const health = z
    .object({ data: z.object({ release: releaseIdentitySchema }) })
    .parse(await response.json());
  assert.deepEqual(
    health.data.release,
    artifacts.identity,
    "Served release identity must match the exact qualified images.",
  );
}
async function app(db: string): Promise<void> {
  run(
    "docker",
    [...compose, "up", "--no-deps", "-d", "--wait", "app"],
    connection(db),
  );
  await inspectLive(db);
}
async function suite(name: string, db = database): Promise<void> {
  run("docker", [...compose, "restart", "app"], connection(db));
  await app(db);
  run("npm", ["run", `test:${name}`], connection(db));
}
try {
  run("npm", ["run", "package:verify"]);
  run("docker", [...compose, "up", "-d", "--wait", "postgres"]);
  migrate(database);
  run("docker", [
    ...compose,
    "run",
    "--rm",
    "--no-deps",
    "migrate",
    "npm",
    "run",
    "db:status",
  ]);
  migrate(database);
  const gates = `yinsen_test_gates_${suffix}`;
  create(gates);
  migrate(gates);
  run("npm", ["run", "check"], connection(gates));
  const settings = `yinsen_test_settings_${suffix}`;
  create(settings);
  migrate(settings);
  await app(settings);
  await suite("settings", settings);
  await app(database);
  run("npm", ["run", "test:http"], connection(database));
  run("npm", ["run", "test:browser"], {
    ...connection(database),
    BROWSER_PROOF_DIRECTORY: fixture,
  });
  for (const name of [
    "projects",
    "invoices",
    "deliverables",
    "messages",
    "proposals",
    "analytics",
    "clients",
    "access",
  ])
    await suite(name);
  run("npm", ["run", "package:verify"]);
} finally {
  run("docker", [...compose, "stop", "app", "postgres"]);
}
writeFileSync(
  `${directory}/qualification.json`,
  JSON.stringify({
    passed: true,
    artifactsSha256: createHash("sha256")
      .update(readFileSync(artifactsPath))
      .digest("hex"),
  }) + "\n",
);
writeFileSync(
  `${fixture}/resources.json`,
  JSON.stringify(
    { project, envPath, database, origin, artifactsPath, passed: true },
    null,
    2,
  ) + "\n",
);
