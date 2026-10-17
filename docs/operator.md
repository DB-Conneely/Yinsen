# Running your installation

Tasks 1.1–1.2 instructions, resumed on Abyss on 17 October 2026. First boot and operator access are installed; client identity and manual/email links follow in Task 1.3. Phase 1 acceptance remains with fresh QA. See the [current handover](handover.md) and [source-bound evidence](as-built/phase-01.md).

Yinsen uses one long-lived Node.js application and PostgreSQL 16. Infrastructure credentials stay in server environment variables. No external provider is required for first boot and operator access. The current operator shell establishes access; later tasks deliver client management and project work.

## Docker Compose

Use Docker Engine with Compose v2. Copy `.env.example` to `.env`, generate **three separate** passwords using `openssl rand -hex 32`, and replace the three password placeholders. Set `APP_ORIGIN` to your public HTTPS origin, or `http://localhost:3000` for a local rehearsal. Keep `.env` private and outside version control.

Run these commands from the repository root:

```sh
docker compose up -d --wait postgres
docker compose build app
docker compose --profile tools build migrate
docker compose run --rm migrate
docker compose run --rm migrate npm run db:status
docker compose up -d --wait app
```

Visit `http://localhost:3000` locally and `/api/health`. The health response must return HTTP 200 and `data.status: healthy`; a running process alone does not establish readiness. Compose exposes the application and database only on loopback. For internet access, place the application behind your own HTTPS reverse proxy. Agents do not deploy this project.

## First boot and operator access

An installation without an operator redirects its public, login and dashboard pages to `/setup`. Complete the four steps: operator account, live database verification, branding, completion. Setup uses your environment-owned database connection; it never collects or stores provider credentials. Email, payments and file storage are honestly skipped until their usable feature/configuration is installed. No external account is needed to create your portal.

Use a unique password of at least eight characters, up to 72 UTF-8 bytes (bcrypt's input limit). Setup shows length guidance and stores a bcrypt cost-12 hash. Email is trimmed and lowercased. Brand name, colour, welcome copy and default currency are saved together with the sole operator and initial session. Logo upload and invoice numbering controls arrive with their actual consumers; there is no unconnected upload control.

After setup, `/setup` returns 404 and repeated or competing setup API writes return 409. PostgreSQL serializes creation and enforces the singleton. Keep a new installation private until its operator has completed setup; first boot establishes installation ownership.

Use `/login` for the operator and `/portal/login` for client access instructions. `/dashboard` and `/api/auth/me` independently require a current operator session. Navigation exposes only installed pages. Logout deletes that session immediately. Operator sessions use random 32-byte tokens, store only SHA-256 digests and expire after 90 inactive days. Authenticated requests renew the stored expiry; dashboard responses and the current-user endpoint renew the browser cookie. Cookies are HTTP-only, SameSite=Lax, Path=/ and Secure in production. Production internet access requires HTTPS; Chromium treats localhost as a secure development exception.

All JSON writes require an exact `Origin` matching `APP_ORIGIN`; an arbitrary Host or forwarded header cannot change that authority. Browser forms send JSON to ordinary API endpoints. Set the public origin correctly and restart after environment changes. No proxy-origin inference is performed.

Login allows five attempts per TCP peer within 15 minutes in the single long-lived process. The native Next Node API reads the request socket and ignores caller-supplied forwarding headers. Behind a reverse proxy, requests share that proxy peer's bucket: configure stricter client-IP throttling at your edge when needed. The application never trusts unvalidated `X-Forwarded-For`/`X-Real-IP`. In-memory counters reset on application restart; there is no distributed/replica claim.

The PostgreSQL named volume holds all database state. Ordinary `docker compose stop`/`start` or application recreation preserves it. Do not remove database volumes to resolve startup errors. Initial role creation runs only on an empty volume; editing `.env` does not rotate an existing database password. Use PostgreSQL's account administration to rotate it, then update the matching URL and restart the application. A partially initialized volume requires inspection and repair by its owner, not an automatic reset.

The app receives only `DATABASE_URL`, `DATABASE_SSL` and `APP_ORIGIN`; migration/admin passwords are not passed to it. The separate one-off migration service receives the migration URL. Schema changes are always explicit. Never expose the tools image or migration credentials as the application runtime.

## Source development and production

Use Node.js 22.21.1 and npm 10.9.4, or the pinned Docker image. The supported Node major is 22; exact dependency versions are locked in `package-lock.json`.

```sh
npm ci
docker compose up -d --wait postgres
npm run db:migrate
npm run db:status
npm run dev
```

Next.js and the database commands load `.env` from the repository root. The source URLs in `.env.example` address the loopback database port. For a different local PostgreSQL instance, create `yinsen_migrator` and `yinsen_runtime` with the grants in `docker/init-database.sql`, supply their separate URLs, and run explicit migrations. Do not use an administrator URL for the runtime.

For an ordinary built production run:

```sh
npm run build
npm start
```

For a loopback-only source preview, use `HOSTNAME=127.0.0.1 PORT=3000 npm start`. Stop the development server before building; the development and production commands share `.next`.

Both production entrypoints use Next's supported generated standalone `server.js` and run the same instrumentation startup guard. The source launcher loads the current root environment before starting it, then removes admin/migrator credentials and redundant password variables from the child runtime environment. Contributor development commands load the full local `.env`; use synthetic data there. Build preparation copies static assets and removes only generated dotenv copies from the standalone output, so build-time secrets do not become runtime configuration. Builds do not require a database or real secrets; configuration and schema validation run when the server starts. Do not run development and production builds against the same `.next` directory concurrently.

## Configuration and database access

`DATABASE_URL` requires PostgreSQL credentials and a database name. `MIGRATION_DATABASE_URL` belongs only to explicit migration/status commands. URL query parameters are rejected so they cannot silently override TLS policy. Hex passwords avoid URL encoding mistakes. `DATABASE_SSL=disable` is allowed only for localhost and the private Compose `postgres` hostname. Use `verify-full` for every other hostname; it validates the server certificate using Node's trusted certificate authorities. Supply a private CA through standard `NODE_EXTRA_CA_CERTS` configuration when needed. Never disable certificate verification for a remote host.

The runtime pool is limited to five connections, with a five-second connect/statement timeout and twenty-second idle timeout. The migration connection is separate and limited to one. PostgreSQL grants runtime table DML in `public` and read-only migration-ledger access; it cannot create tables, alter schema or update migration history. The migrator owns schema objects without superuser, role-creation or database-creation privileges. Concurrent explicit migrations serialize with a PostgreSQL advisory lock.

`npm run db:status` verifies the complete checked-in migration hashes and ordering. It exits nonzero for missing, pending, extra or changed migrations. `db:migrate` is repeatable and then verifies the result. Startup and health never migrate. A schema mismatch prevents a successful startup; health returns HTTP 503 if connectivity or schema readiness later fails. Restore the service or apply the reviewed migration, then restart when startup previously failed.

`APP_ORIGIN` is an HTTPS origin without a path, credentials or query; localhost HTTP is allowed for local development. Restart after environment changes. Secrets are never returned by health or included in safe application error logs. Health failures carry an `X-Request-Id` matching the structured log correlation ID.

## Engineering checks

The test suite requires a deliberate isolated synthetic PostgreSQL fixture, fully migrated. Never point it at customer data or assume the preserved root `.env` is the test fixture. Access tests refuse to run without `TEST_ISOLATED_DATABASE=1`; they establish a synthetic operator if absent and preserve it for repeatable runs. `npm test` checks actual schema, privilege denials, setup conflicts, password/session behavior and rollback as well as configuration, logs and rendering. Load the fixture environment before running checks, for example:

```sh
TEST_ISOLATED_DATABASE=1 node --env-file=/absolute/private/fixture.env --run check
TEST_ORIGIN=http://localhost:3007 npm run test:http
TEST_ISOLATED_DATABASE=1 node --env-file=/absolute/private/fixture.env --run test:access
```

The HTTP checks exercise an ordinary already-running installation. `test:access` expects a synthetic setup with the test account defined in `tests/access.test.ts` and a newly started application process so its in-memory attempt window is clear; it deliberately exhausts login throttling. It checks the real protected pages, CSRF, session expiry/revocation, cookie renewal and rotated forwarding headers. Await startup readiness before running it. `test:http` supports either first boot or an installed branded landing page.

See [engineering gates](as-built/engineering-gates.md) for the mapping and exercised failures. These checks support installed functional proof; they do not establish future project, invoice or provider behavior.

## Current Abyss development resources

Run this checkout only on `abyssbox` at `/home/neels/development/yinsen` (SSH alias `abyss`), with Node 22.21.1/npm 10.9.4. The restored private database is `yinsen_abyss-postgres-1`, volume `yinsen_abyss_postgres_data`, bound to `127.0.0.1:55432`. Its Compose configuration belongs to the preserved migration fixture; inspect its labels/mounts before operation. Use `docker start yinsen_abyss-postgres-1` when it is stopped. Do not recreate it from this repository's generic Compose file or remove its volume. The private root `.env` selects this fixture.

Task 1.1's separate synthetic rehearsal is project `yinsen_t11_remote_20261017`, database port 55433 and app port 3006. Its retained private configuration and service ownership records live under ignored `.local/remote-11/`; neither passwords nor raw logs belong in commits. Port 3001 belongs to another project.

Run heavy builds/checks/browser suites serially across agents. On this server, the shared `/tmp` user quota was exhausted despite free disk space. Use a task-owned on-disk temporary directory, for example `mkdir -p .local/tmp` then `TMPDIR="$PWD/.local/tmp" npm run check`; do not clean another workload's files. The shared Docker buildx activity file was root-owned, so rehearsal used a private `DOCKER_CONFIG` directory under `.local/remote-11/docker-cli` rather than modifying shared Docker configuration. This changes the CLI state location, not the Docker daemon or application configuration.
