import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  chmodSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import postgres from "postgres";
import { artifactSetSchema, releaseIdentitySchema } from "../src/lib/release";
import { readConfiguration, type Configuration } from "../src/lib/config";
import { AppError, ConfigurationError } from "../src/lib/errors";
import {
  assertPrefix,
  fileSchema,
  installationSchema,
  operationJournalSchema,
  releaseDecision,
  sha256,
  snapshotSchema,
  type Artifacts,
  type OperationJournal,
  type Snapshot,
} from "./operations-contract";
import {
  copyRemoteFiles,
  hashFile,
  inventory,
  requireDiskSpace,
  safePath,
  verifySnapshot,
} from "./installation-files";

type Installation = {
  project: string;
  credentialFile: string;
  stateDirectory: string;
  backupDirectory: string;
  temporary: string;
  environmentFile: string;
  environment: Record<string, string | undefined>;
  configuration: Configuration;
  database: string;
  postgresPort: number;
  origin: string;
};
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const action = process.argv[2],
  input = process.argv[3];

function fail(message: string): never {
  throw new ConfigurationError(message);
}
function json(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
function save(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  const fd = openSync(temporary, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  syncDirectory(dirname(path));
}
function syncDirectory(path: string): void {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function privateFile(path: string): void {
  const metadata = lstatSync(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== process.getuid?.() ||
    metadata.mode & 0o077
  )
    fail("Installation inputs must be owner-only regular files.");
}
function privateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const metadata = lstatSync(path);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== process.getuid?.() ||
    metadata.mode & 0o077
  )
    fail("Operation directories must be owner-only real directories.");
}
function run(args: string[], inputBytes?: Uint8Array): string {
  try {
    return execFileSync(
      "docker",
      ["--host", "unix:///var/run/docker.sock", ...args],
      {
        encoding: "utf8",
        input: inputBytes,
        maxBuffer: 16 * 1024 * 1024,
        env: dockerEnvironment(),
        stdio: [inputBytes ? "pipe" : "ignore", "pipe", "pipe"],
      },
    );
  } catch {
    return fail(
      "Docker operation failed. Inspect the private target logs and retained operation journal.",
    );
  }
}
function dockerEnvironment(): NodeJS.ProcessEnv {
  // Compose must consume only the selected credential/images files, never ambient target inputs.
  const allowed = ["PATH", "HOME", "DOCKER_CONFIG", "XDG_RUNTIME_DIR"];
  return {
    NODE_ENV: "production",
    ...Object.fromEntries(allowed.map((name) => [name, process.env[name]])),
  };
}
function compose(i: Installation, args: string[]): string {
  const files = ["--env-file", i.environmentFile];
  const images = join(i.stateDirectory, "images.env");
  if (existsSync(images)) files.push("--env-file", images);
  return run([
    "compose",
    "--project-directory",
    root,
    "--project-name",
    i.project,
    ...files,
    "-f",
    join(root, "compose.yaml"),
    "-f",
    join(root, "compose.release.yaml"),
    ...args,
  ]);
}
function load(path: string): Installation {
  privateFile(path);
  const settings = installationSchema.parse(json(path));
  for (const key of [
    "credentialFile",
    "stateDirectory",
    "backupDirectory",
  ] as const)
    settings[key] = resolve(dirname(path), settings[key]);
  privateFile(settings.credentialFile);
  privateDirectory(settings.stateDirectory);
  privateDirectory(settings.backupDirectory);
  const runtime =
    process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.()}`;
  privateDirectory(runtime);
  const temporary = mkdtempSync(join(runtime, "yinsen-operations-"));
  const environmentFile = join(temporary, "installation.env");
  try {
    decryptCredential(settings.credentialFile, environmentFile);
    const environment = parseEnv(readFileSync(environmentFile, "utf8"));
    return bindInstallation(settings, temporary, environmentFile, environment);
  } catch (error: unknown) {
    rmSync(temporary, { recursive: true });
    throw error;
  }
}
function decryptCredential(path: string, destination: string): void {
  const credential = execFileSync(
    "systemd-creds",
    [
      "decrypt",
      "--user",
      "--refuse-null",
      "--name=yinsen-installation",
      path,
      "-",
    ],
    { stdio: "pipe" },
  );
  writeFileSync(destination, credential, { mode: 0o600, flag: "wx" });
  privateFile(destination);
}
function bindInstallation(
  settings: ReturnType<typeof installationSchema.parse>,
  temporary: string,
  environmentFile: string,
  environment: Installation["environment"],
): Installation {
  if (environment.COMPOSE_PROJECT_NAME !== settings.project)
    fail("Credential and installation project disagree.");
  const database = environment.POSTGRES_DB ?? "yinsen",
    postgresPort = Number(environment.POSTGRES_PORT ?? "55432");
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(database) ||
    !Number.isInteger(postgresPort) ||
    postgresPort < 1024 ||
    postgresPort > 65535
  )
    fail("Invalid private database identity or port.");
  const databaseUrl = `postgresql://yinsen_runtime:${encodeURIComponent(environment.RUNTIME_PASSWORD ?? "")}@127.0.0.1:${postgresPort}/${database}`;
  const configuration = readConfiguration({
    ...environment,
    DATABASE_URL: databaseUrl,
    DATABASE_SSL: "disable",
  });
  return {
    ...settings,
    temporary,
    environmentFile,
    environment,
    configuration,
    database,
    postgresPort,
    origin: configuration.origin,
  };
}
async function database<T>(
  i: Installation,
  callback: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  const sql = postgres(i.configuration.databaseUrl, {
    ssl: false,
    max: 1,
    connect_timeout: 5,
    onnotice: () => undefined,
  });
  try {
    return await callback(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
async function permission(i: Installation): Promise<boolean> {
  try {
    return await database(i, async (sql) => {
      const rows = await sql<
        { allow_automatic_updates: unknown }[]
      >`select allow_automatic_updates from settings where singleton = true`;
      return rows.length === 1 && rows[0]?.allow_automatic_updates === true;
    });
  } catch {
    return false;
  }
}
async function prefix(i: Installation, artifacts: Artifacts): Promise<void> {
  await database(i, async (sql) => {
    const exists = await sql<
      { ledger: string | null }[]
    >`select to_regclass('drizzle.__drizzle_migrations')::text as ledger`;
    if (!exists[0]?.ledger) fail("Installed migration ledger is missing.");
    const rows = exists[0]?.ledger
      ? await sql<
          { hash: string; created_at: string }[]
        >`select hash,created_at from drizzle.__drizzle_migrations order by created_at,id`
      : [];
    assertPrefix(rows, artifacts.identity);
  });
}
function container(i: Installation, service = "app"): string {
  const id = compose(i, ["ps", "--all", "--quiet", service]).trim();
  if (!/^[a-f0-9]{64}$/.test(id))
    fail("Expected exactly one installation container.");
  const project = run([
    "inspect",
    "--format",
    '{{index .Config.Labels "com.docker.compose.project"}}',
    id,
  ]).trim();
  if (project !== i.project) fail("Container ownership mismatch.");
  return id;
}
function imageIdentity(image: string): unknown {
  return JSON.parse(
    run(["run", "--rm", "--entrypoint", "cat", image, "/app/release.json"]),
  );
}
function resolveImage(reference: string, pull = false): string {
  if (pull && reference.includes("@sha256:")) run(["pull", reference]);
  return run(["image", "inspect", "--format", "{{.Id}}", reference]).trim();
}
function verifyArtifacts(artifacts: Artifacts): void {
  for (const artifact of [artifacts.runtime, artifacts.tools]) {
    const id = resolveImage(artifact.image, true);
    if (
      (artifact.image.startsWith("sha256:") && id !== artifact.id) ||
      JSON.stringify(imageIdentity(id)) !== JSON.stringify(artifacts.identity)
    )
      fail("Artifact bytes and approved release identity disagree.");
  }
}
async function health(i: Installation): Promise<unknown> {
  const response = await fetch(`${i.origin}/api/health`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) fail("Installed health check failed.");
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("data" in body) ||
    !body.data ||
    typeof body.data !== "object" ||
    !("release" in body.data)
  )
    fail("Installed health response lacks a release identity.");
  return body.data.release;
}
function installedArtifacts(i: Installation): Artifacts {
  const id = run(["inspect", "--format", "{{.Image}}", container(i)]).trim();
  const state = join(i.stateDirectory, "active.json");
  if (existsSync(state)) {
    const artifacts = artifactSetSchema.parse(json(state));
    if (
      resolveImage(artifacts.runtime.image) !== id ||
      JSON.stringify(imageIdentity(id)) !== JSON.stringify(artifacts.identity)
    )
      fail(
        "Actual installed image differs from active receipt. Resolve before updating.",
      );
    return artifacts;
  }
  const identity = releaseIdentitySchema.parse(imageIdentity(id));
  const tools = i.environment.YINSEN_TOOLS_IMAGE;
  if (!tools) fail("The installed matching tools image is required.");
  const artifacts = artifactSetSchema.parse({
    format: 1,
    identity,
    runtime: { image: id, id },
    tools: { image: tools, id: resolveImage(tools) },
  });
  verifyArtifacts(artifacts);
  return artifacts;
}
async function current(i: Installation): Promise<Artifacts> {
  const artifacts = installedArtifacts(i);
  if (JSON.stringify(await health(i)) !== JSON.stringify(artifacts.identity))
    fail("Installed health identity differs from actual image.");
  return artifacts;
}
function select(i: Installation, artifacts: Artifacts): void {
  const path = join(i.stateDirectory, "images.env"),
    temporary = `${path}.tmp`;
  writeFileSync(
    temporary,
    `YINSEN_RUNTIME_IMAGE=${artifacts.runtime.image}\nYINSEN_TOOLS_IMAGE=${artifacts.tools.image}\n`,
    { mode: 0o600 },
  );
  renameSync(temporary, path);
}
async function ready(i: Installation, artifacts: Artifacts): Promise<void> {
  compose(i, ["up", "-d", "--wait", "--wait-timeout", "90", "app"]);
  const actual = run([
    "inspect",
    "--format",
    "{{.Image}}",
    container(i),
  ]).trim();
  if (
    actual !== resolveImage(artifacts.runtime.image) ||
    JSON.stringify(await health(i)) !== JSON.stringify(artifacts.identity)
  )
    fail(
      "Serving image or release identity does not match the approved artifact.",
    );
  const landing = await fetch(i.origin, { signal: AbortSignal.timeout(15000) });
  if (!landing.ok || !(await landing.text()).includes("<!DOCTYPE html>"))
    fail("Installed public-page smoke check failed.");
  await prefix(i, artifacts);
}
async function references(i: Installation): Promise<Snapshot["files"]> {
  return database(i, async (sql) =>
    (
      await sql`select key,driver,size,sha256 from branding_assets union all select storage_key as key,driver,size,sha256 from message_attachments union all select storage_key as key,driver,size,sha256 from deliverables order by key`
    ).map((row) => fileSchema.parse(row)),
  );
}
async function projections(i: Installation): Promise<Snapshot["projections"]> {
  return database(i, async (sql) => {
    const result: Snapshot["projections"] = {};
    const rows = await sql<
      { table_name: string; column_name: string }[]
    >`select table_name,column_name from information_schema.columns where table_schema='public' and table_name not in ('operator_sessions','client_sessions','magic_link_tokens','message_reads','activity_events','project_activity') and not (table_name='invoices' and column_name='updated_at') and not (table_name in ('branding_assets','message_attachments','deliverables') and column_name='driver') order by table_name,ordinal_position`;
    for (const row of rows)
      (result[row.table_name] ??= []).push(row.column_name);
    return result;
  });
}
async function facts(
  i: Installation,
  projection: Snapshot["projections"],
): Promise<Snapshot["facts"]> {
  return database(i, async (sql) => {
    const result: Snapshot["facts"] = {};
    for (const [tablename, columns] of Object.entries(projection)) {
      const expression =
        tablename === "invoices"
          ? sql`(to_jsonb(t)-'updated_at'-'status') || jsonb_build_object('status',case when t.status in ('sent','overdue') then 'open' else t.status end)`
          : ["branding_assets", "message_attachments", "deliverables"].includes(
                tablename,
              )
            ? sql`to_jsonb(t)-'driver'`
            : sql`to_jsonb(t)`;
      const projected = sql`(select jsonb_object_agg(key,value) from jsonb_each(${expression}) where key = any(${columns}::text[]))`;
      const rows =
        await sql`select ${projected} as value from ${sql(tablename)} t order by (${projected})::text`;
      result[tablename] = sha256(JSON.stringify(rows));
    }
    return result;
  });
}
async function retained(i: Installation, snapshot: Snapshot): Promise<void> {
  if (
    JSON.stringify(await facts(i, snapshot.projections)) !==
    JSON.stringify(snapshot.facts)
  )
    fail("Restored/updated business facts differ from the checkpoint.");
  const bytes = snapshot.inventory
    .filter(
      (file) =>
        file.path.startsWith("local/") ||
        i.configuration.storage.driver === "local",
    )
    .reduce((total, file) => total + file.size, 0);
  await requireDiskSpace(i.stateDirectory, bytes);
  const directory = mkdtempSync(join(i.stateDirectory, "retention-"));
  try {
    run(["cp", `${container(i)}:/app/data/uploads/.`, directory]);
    for (const file of snapshot.files.filter(
      (file) =>
        file.driver === "local" || i.configuration.storage.driver === "local",
    )) {
      if ((await hashFile(safePath(directory, file.key))) !== file.sha256)
        fail(
          "Restored/updated retained file bytes differ from the checkpoint.",
        );
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
}
function assertNoWriters(i: Installation): void {
  const count = compose(i, [
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "postgres",
    "-d",
    i.database,
    "-Atc",
    "select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend'",
  ]).trim();
  if (count !== "0")
    fail(
      "Other database clients remain. Stop all external writers/readers before checkpointing.",
    );
}
function dump(i: Installation, path: string): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    execFileSync(
      "docker",
      [
        ...composeArguments(i),
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        "postgres",
        "-d",
        i.database,
        "--format=custom",
        "--no-owner",
        "--no-acl",
      ],
      { stdio: ["ignore", fd, "pipe"], env: dockerEnvironment() },
    );
  } finally {
    closeSync(fd);
  }
}
function composeArguments(i: Installation): string[] {
  const files = ["--env-file", i.environmentFile];
  if (existsSync(join(i.stateDirectory, "images.env")))
    files.push("--env-file", join(i.stateDirectory, "images.env"));
  return [
    "--host",
    "unix:///var/run/docker.sock",
    "compose",
    "--project-directory",
    root,
    "--project-name",
    i.project,
    ...files,
    "-f",
    join(root, "compose.yaml"),
    "-f",
    join(root, "compose.release.yaml"),
  ];
}
function psql(i: Installation, args: string[]): string {
  return compose(i, [
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "postgres",
    "-d",
    i.database,
    "-v",
    "ON_ERROR_STOP=1",
    ...args,
  ]);
}
async function checkpoint(
  i: Installation,
  artifacts: Artifacts,
): Promise<string> {
  await checkpointCapacity(i, artifacts);
  const path = join(
    i.backupDirectory,
    `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`,
  );
  privateDirectory(path);
  await mkdir(join(path, "files", "local"), { recursive: true, mode: 0o700 });
  compose(i, ["stop", "--timeout", "30", "app"]);
  assertNoWriters(i);
  const files = await references(i);
  const projection = await projections(i);
  assertNoWriters(i);
  dump(i, join(path, "database.dump"));
  run([
    "cp",
    `${container(i)}:/app/data/uploads/.`,
    join(path, "files", "local"),
  ]);
  await copyRemoteFiles(files, join(path, "files"), i.configuration.storage);
  const snapshot: Snapshot = {
    format: 1,
    project: i.project,
    createdAt: new Date().toISOString(),
    artifacts,
    files,
    facts: await facts(i, projection),
    projections: projection,
    inventory: await inventory(join(path, "files")),
    databaseSha256: await hashFile(join(path, "database.dump")),
  };
  await sealSnapshot(i, path, snapshot);
  return path;
}
async function checkpointCapacity(
  i: Installation,
  artifacts: Artifacts,
): Promise<void> {
  const local = Number(
    run([
      "run",
      "--rm",
      "--volume",
      `${i.project}_uploads_data:/files:ro`,
      "--entrypoint",
      "du",
      artifacts.tools.image,
      "-sb",
      "/files",
    ]).split(/\s/)[0],
  );
  const remote = (await references(i))
    .filter((file) => file.driver === "s3")
    .reduce((total, file) => total + file.size, 0);
  const databaseBytes = await database(i, async (sql) => {
    const rows = await sql<
      { bytes: string }[]
    >`select pg_database_size(current_database())::text as bytes`;
    return Number(rows[0]?.bytes);
  });
  const backup = local + remote + databaseBytes;
  const sharedDisk =
    statSync(i.stateDirectory).dev === statSync(i.backupDirectory).dev;
  await requireDiskSpace(i.backupDirectory, backup + (sharedDisk ? local : 0));
  await requireDiskSpace(i.stateDirectory, local);
}
async function sealSnapshot(
  i: Installation,
  path: string,
  snapshot: Snapshot,
): Promise<void> {
  execFileSync(
    "systemd-creds",
    [
      "encrypt",
      "--user",
      "--name=yinsen-installation",
      i.environmentFile,
      join(path, "installation.cred"),
    ],
    { stdio: "pipe" },
  );
  chmodSync(join(path, "installation.cred"), 0o600);
  await verifySnapshot(path, snapshot);
  save(join(path, "snapshot.json"), snapshot);
}
function journal(i: Installation, value: OperationJournal): void {
  save(join(i.stateDirectory, "journal.json"), value);
}
function restoreDatabase(i: Installation, directory: string): void {
  const fd = openSync(join(directory, "database.dump"), "r");
  try {
    execFileSync(
      "docker",
      [
        ...composeArguments(i),
        "exec",
        "-T",
        "postgres",
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        i.database,
        "--role=yinsen_migrator",
        "--clean",
        "--if-exists",
        "--single-transaction",
        "--no-owner",
        "--no-acl",
      ],
      { stdio: [fd, "pipe", "pipe"], env: dockerEnvironment() },
    );
  } finally {
    closeSync(fd);
  }
  psql(i, ["-f", "/docker-entrypoint-initdb.d/database-permissions.psql"]);
  psql(i, [
    "-c",
    "grant usage on schema drizzle to yinsen_runtime; grant select on drizzle.__drizzle_migrations to yinsen_runtime;",
  ]);
}
async function restoreFiles(
  i: Installation,
  directory: string,
  snapshot: Snapshot,
  localCopy: boolean,
): Promise<void> {
  const staging = mkdtempSync(join(i.stateDirectory, "restore-files-"));
  try {
    await cp(join(directory, "files", "local"), staging, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    for (const file of snapshot.files.filter((file) => file.driver === "s3")) {
      if (!localCopy) continue; // Original immutable remote objects remain untouched during same-target recovery.
      const destination = safePath(staging, file.key);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await cp(
        safePath(join(directory, "files", "objects"), file.key),
        destination,
        { force: false, errorOnExist: true },
      );
    }
    attachRestoredFiles(i, staging, snapshot.artifacts.tools.image);
    if (localCopy)
      psql(i, [
        "-c",
        "begin; update branding_assets set driver='local' where driver='s3'; update message_attachments set driver='local' where driver='s3'; update deliverables set driver='local' where driver='s3'; commit;",
      ]);
  } finally {
    rmSync(staging, { recursive: true });
  }
}
function attachRestoredFiles(
  i: Installation,
  staging: string,
  tools: string,
): void {
  run(["cp", `${staging}/.`, `${container(i)}:/app/data/uploads`]);
  const volume = run([
    "inspect",
    "--format",
    '{{range .Mounts}}{{if eq .Destination "/app/data/uploads"}}{{.Name}}{{end}}{{end}}',
    container(i),
  ]).trim();
  if (volume !== `${i.project}_uploads_data`)
    fail("Unexpected upload volume identity.");
  run([
    "run",
    "--rm",
    "--user",
    "0",
    "--volume",
    `${volume}:/files`,
    "--entrypoint",
    "chown",
    tools,
    "-R",
    "1000:1000",
    "/files",
  ]);
}
async function restore(
  i: Installation,
  directory: string,
  localCopy: boolean,
  resuming = false,
): Promise<Snapshot> {
  const snapshot = await validateRestore(i, directory, localCopy);
  compose(i, ["up", "-d", "--wait", "postgres"]);
  if (localCopy && !resuming) assertFreshDatabase(i);
  journal(i, {
    format: 1,
    previous: snapshot.artifacts,
    checkpoint: directory,
    phase: "restore",
    localCopy,
  });
  compose(i, ["stop", "--timeout", "30", "app"]);
  assertNoWriters(i);
  restoreDatabase(i, directory);
  select(i, snapshot.artifacts);
  compose(i, ["create", "app"]);
  await restoreFiles(i, directory, snapshot, localCopy);
  await retained(i, snapshot);
  await activate(i, snapshot.artifacts, directory, snapshot.artifacts);
  return snapshot;
}
async function validateRestore(
  i: Installation,
  directory: string,
  localCopy: boolean,
): Promise<Snapshot> {
  if (
    localCopy &&
    (i.configuration.email ||
      i.configuration.stripe ||
      i.configuration.storage.driver !== "local")
  )
    fail("Recovery copies require local storage and disabled email/Stripe.");
  const snapshot = snapshotSchema.parse(json(join(directory, "snapshot.json")));
  await verifySnapshot(directory, snapshot);
  verifyArtifacts(snapshot.artifacts);
  await requireDiskSpace(
    i.stateDirectory,
    snapshot.inventory
      .filter((file) => file.path.startsWith("local/") || localCopy)
      .reduce((total, file) => total + file.size, 0),
  );
  return snapshot;
}
function assertFreshDatabase(i: Installation): void {
  const count = compose(i, [
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "postgres",
    "-d",
    i.database,
    "-Atc",
    "select count(*) from pg_tables where schemaname in ('public','drizzle')",
  ]).trim();
  if (count !== "0") fail("Restore-copy refuses a nonempty target database.");
}
async function activate(
  i: Installation,
  target: Artifacts,
  checkpoint: string | null,
  previous: Artifacts,
): Promise<void> {
  // Before any startup consumer or request can write, recovery becomes forward-only.
  journal(i, { format: 1, previous, checkpoint, phase: "activation", target });
  select(i, target);
  save(join(i.stateDirectory, "active.json"), target);
  await ready(i, target);
}
async function recover(i: Installation): Promise<void> {
  const path = join(i.stateDirectory, "journal.json");
  if (!existsSync(path)) fail("No interrupted operation journal exists.");
  const parsed = operationJournalSchema.safeParse(json(path));
  if (!parsed.success)
    fail(
      "Invalid or legacy ambiguous recovery journal. Preserve the current database and obtain operator repair; no automatic restore is safe.",
    );
  const value = parsed.data,
    previous = value.previous;
  if (value.phase === "activation")
    await activate(i, value.target, value.checkpoint, previous);
  else if (typeof value.checkpoint === "string")
    await restore(
      i,
      value.checkpoint,
      value.phase === "restore" && value.localCopy,
      true,
    );
  else {
    select(i, previous);
    await ready(i, previous);
  }
  save(join(i.stateDirectory, "last-recovery.json"), {
    recovered: true,
    at: new Date().toISOString(),
    previous,
  });
  renameSync(path, join(i.stateDirectory, `recovered-${randomUUID()}.json`));
  syncDirectory(i.stateDirectory);
}
function candidate(path: string, receiptPath: string): Artifacts {
  const bytes = readFileSync(path),
    receipt: unknown = json(receiptPath);
  if (
    !receipt ||
    typeof receipt !== "object" ||
    !("passed" in receipt) ||
    receipt.passed !== true ||
    !("artifactsSha256" in receipt) ||
    receipt.artifactsSha256 !== sha256(bytes)
  )
    fail("Approved qualification does not bind the candidate manifest.");
  return artifactSetSchema.parse(JSON.parse(bytes.toString("utf8")));
}
async function update(
  i: Installation,
  release: string,
  receipt: string,
): Promise<void> {
  if (existsSync(join(i.stateDirectory, "journal.json")))
    fail("Interrupted operation requires installation:recover first.");
  const approved = candidate(release, receipt);
  if (!(await permission(i))) {
    process.stdout.write(
      "Update skipped: permission is off, missing or unreadable. Current app retained.\n",
    );
    return;
  }
  const previous = await current(i),
    decision = releaseDecision(previous, approved);
  if (decision === "duplicate") {
    process.stdout.write(
      "Release already installed; no migration or replacement.\n",
    );
    return;
  }
  verifyArtifacts(approved);
  await prefix(i, approved);
  if (!(await permission(i))) {
    process.stdout.write(
      "Update skipped: current permission no longer authorises a start.\n",
    );
    return;
  }
  journal(i, { format: 1, previous, checkpoint: null, phase: "checkpoint" });
  await replace(i, previous, approved);
}
async function replace(
  i: Installation,
  previous: Artifacts,
  approved: Artifacts,
): Promise<void> {
  try {
    const path = await checkpoint(i, previous);
    journal(i, { format: 1, previous, checkpoint: path, phase: "migration" });
    select(i, approved);
    compose(i, ["run", "--rm", "migrate"]);
    compose(i, ["run", "--rm", "migrate", "npm", "run", "db:status"]);
    journal(i, { format: 1, previous, checkpoint: path, phase: "retention" });
    await retained(i, snapshotSchema.parse(json(join(path, "snapshot.json"))));
    await activate(i, approved, path, previous);
    completeUpdate(i, approved, path);
  } catch {
    try {
      await recover(i);
      process.stderr.write(
        "Update failed; recovery completed. Before activation this restores the previous checkpoint; after activation it preserves the selected target and all new writes.\n",
      );
    } catch {
      process.stderr.write(
        "Update failed and recovery needs operator repair. Retain all data; run installation:recover after correcting the cause.\n",
      );
    }
    process.exitCode = 1;
  }
}
function completeUpdate(
  i: Installation,
  artifacts: Artifacts,
  checkpoint: string,
): void {
  save(join(i.stateDirectory, "active.json"), artifacts);
  save(join(i.stateDirectory, "last-update.json"), {
    updated: true,
    at: new Date().toISOString(),
    checkpoint,
    artifacts,
  });
  renameSync(
    join(i.stateDirectory, "journal.json"),
    join(i.stateDirectory, `completed-${randomUUID()}.json`),
  );
  syncDirectory(i.stateDirectory);
  process.stdout.write(
    "Qualified release installed; exact serving identity and schema verified.\n",
  );
}
async function restart(i: Installation): Promise<void> {
  if (existsSync(join(i.stateDirectory, "journal.json")))
    fail("Recover interrupted operation before restarting.");
  const installed = installedArtifacts(i);
  select(i, installed);
  compose(i, [
    "up",
    "-d",
    "--force-recreate",
    "--wait",
    "--wait-timeout",
    "90",
    "app",
  ]);
  await ready(i, installed);
  process.stdout.write(
    "Current exact image restarted with refreshed private configuration; persistent data retained.\n",
  );
}
async function backup(i: Installation): Promise<void> {
  if (existsSync(join(i.stateDirectory, "journal.json")))
    fail("Recover interrupted operation before backing up.");
  const previous = await current(i);
  journal(i, { format: 1, previous, checkpoint: null, phase: "backup" });
  try {
    const path = await checkpoint(i, previous);
    await ready(i, previous);
    renameSync(
      join(i.stateDirectory, "journal.json"),
      join(i.stateDirectory, `backup-${randomUUID()}.json`),
    );
    process.stdout.write(`Consistent database/files checkpoint: ${path}\n`);
  } catch (error: unknown) {
    await recover(i);
    throw error;
  }
}
async function main(i: Installation): Promise<void> {
  if (action === "status") await status(i);
  else if (action === "backup") await backup(i);
  else if (action === "restart") await restart(i);
  else if (action === "update") {
    const release = process.argv[4],
      receipt = process.argv[5];
    if (!release || !receipt)
      fail("Supply approved manifest and matching qualification paths.");
    await update(i, resolve(release), resolve(receipt));
  } else if (action === "recover") await recover(i);
  else if (action === "restore-copy") await restoreCopy(i);
  else
    fail(
      "Use status, restart, backup, update, recover or restore-copy with a private installation JSON.",
    );
}
async function status(i: Installation): Promise<void> {
  const installed = installedArtifacts(i);
  let healthy = false;
  try {
    healthy =
      JSON.stringify(await health(i)) === JSON.stringify(installed.identity);
  } catch {
    /* Status still exposes the safe recovery mode when the target is unhealthy. */
  }
  const path = join(i.stateDirectory, "journal.json");
  const pending = existsSync(path)
    ? operationJournalSchema.safeParse(json(path))
    : null;
  process.stdout.write(
    JSON.stringify(
      {
        project: i.project,
        origin: i.origin,
        release: installed.identity,
        healthy,
        updatePermitted: await permission(i),
        recoveryRequired: existsSync(join(i.stateDirectory, "journal.json")),
        recoveryMode: pending
          ? pending.success
            ? pending.data.phase === "activation"
              ? "forward-only"
              : "checkpoint-restore"
            : "manual-diagnosis"
          : "none",
      },
      null,
      2,
    ) + "\n",
  );
  if (!healthy) process.exitCode = 1;
}
async function restoreCopy(i: Installation): Promise<void> {
  const directory = process.argv[4];
  if (!directory) fail("Supply a checkpoint directory.");
  if (compose(i, ["ps", "--all", "--quiet", "app"]).trim())
    fail("Restore-copy requires a fresh target with no app container.");
  await restore(i, resolve(directory), true);
  renameSync(
    join(i.stateDirectory, "journal.json"),
    join(i.stateDirectory, `restored-${randomUUID()}.json`),
  );
  syncDirectory(i.stateDirectory);
  process.stdout.write(
    "Isolated database/file copy restored; remote references now use recovered local bytes. Original stores untouched.\n",
  );
}
let installation: Installation | undefined;
let lock: number | undefined;
try {
  if (!input) fail("Supply the private installation JSON path.");
  installation = load(resolve(input));
  lock = openSync(
    join(installation.stateDirectory, "operations.lock"),
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  // flock and this process share the same open file description; the lock stays held until close.
  execFileSync("flock", ["--nonblock", "3"], {
    stdio: ["ignore", "pipe", "pipe", lock],
  });
  await main(installation);
} catch (error: unknown) {
  process.stderr.write(
    `${error instanceof AppError ? error.message : "Operation failed. Verify private inputs, lock ownership, credential access and target service logs."}\n`,
  );
  process.exitCode = 1;
} finally {
  if (lock !== undefined) closeSync(lock);
  if (installation) rmSync(installation.temporary, { recursive: true });
}
