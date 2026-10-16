# Running your installation

Working draft from unfinished Task 1.1, paused on 16 October 2026. The latest standalone/startup changes and final container/tools checks are not yet verified. Follow the [current handover](handover.md) for the existing resource state and outstanding proof; these instructions are not a completed installation acceptance.

Yinsen uses one long-lived Node.js application and PostgreSQL 16. Infrastructure credentials stay in server environment variables. No external provider is required for the foundation. Account setup and client access are delivered by the following Phase 1 tasks; this foundation alone is not a complete client portal.

## Docker Compose

Use Docker Engine with Compose v2. Copy `.env.example` to `.env`, generate **three separate** passwords using `openssl rand -hex 32`, and replace the three password placeholders. Set `APP_ORIGIN` to your public HTTPS origin, or `http://localhost:3000` for a local rehearsal. Keep `.env` private and outside version control.

Run these commands from the repository root:

```sh
docker compose up -d --wait postgres
docker compose build
docker compose run --rm migrate
docker compose run --rm migrate npm run db:status
docker compose up -d --wait app
```

Visit `http://localhost:3000` locally and `/api/health`. The health response must return HTTP 200 and `data.status: healthy`; a running process alone does not establish readiness. Compose exposes the application and database only on loopback. For internet access, place the application behind your own HTTPS reverse proxy. Agents do not deploy this project.

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

Both production entrypoints use Next's supported generated standalone `server.js` and run the same instrumentation startup guard. The source launcher loads the current root environment before starting it. Build preparation copies static assets and removes only generated dotenv copies from the standalone output, so build-time secrets do not become runtime configuration. Builds do not require a database or real secrets; configuration and schema validation run when the server starts. Do not run development and production builds against the same `.next` directory concurrently.

## Configuration and database access

`DATABASE_URL` requires PostgreSQL credentials and a database name. `MIGRATION_DATABASE_URL` belongs only to explicit migration/status commands. URL query parameters are rejected so they cannot silently override TLS policy. Hex passwords avoid URL encoding mistakes. `DATABASE_SSL=disable` is allowed only for localhost and the private Compose `postgres` hostname. Use `verify-full` for every other hostname; it validates the server certificate using Node's trusted certificate authorities. Supply a private CA through standard `NODE_EXTRA_CA_CERTS` configuration when needed. Never disable certificate verification for a remote host.

The runtime pool is limited to five connections, with a five-second connect/statement timeout and twenty-second idle timeout. The migration connection is separate and limited to one. PostgreSQL grants runtime table DML in `public` and read-only migration-ledger access; it cannot create tables, alter schema or update migration history. The migrator owns schema objects without superuser, role-creation or database-creation privileges. Concurrent explicit migrations serialize with a PostgreSQL advisory lock.

`npm run db:status` verifies the complete checked-in migration hashes and ordering. It exits nonzero for missing, pending, extra or changed migrations. `db:migrate` is repeatable and then verifies the result. Startup and health never migrate. A schema mismatch prevents a successful startup; health returns HTTP 503 if connectivity or schema readiness later fails. Restore the service or apply the reviewed migration, then restart when startup previously failed.

`APP_ORIGIN` is an HTTPS origin without a path, credentials or query; localhost HTTP is allowed for local development. Restart after environment changes. Secrets are never returned by health or included in safe application error logs. Health failures carry an `X-Request-Id` matching the structured log correlation ID.

## Engineering checks

The test suite requires the isolated synthetic PostgreSQL described above, fully migrated. Never point test configuration at customer data. `npm test` checks actual schema, privilege denials, constraints and rollback as well as configuration, logs and rendering. `npm run test:http` checks a running installation at localhost:3000; set `TEST_ORIGIN` to exercise another local port.

```sh
npm run check
npm run test:http
```

See [engineering gates](as-built/engineering-gates.md) for the rule-to-command mapping and exercised failures. These checks support real functional proof; they do not establish account, project, invoice or provider behaviour by themselves.
