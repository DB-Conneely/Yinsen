# Running your installation

Tasks 1.1–1.3 instructions, independently VERIFIED on Abyss on 17 October 2026. Operator/client access and the actual configured domain-email receipt, rendering and received-link login are proven. See the [current handover](handover.md) and [source-bound evidence](as-built/phase-01.md).

Yinsen uses one long-lived Node.js application and PostgreSQL 16. Infrastructure credentials stay in server environment variables. No external provider is required for first boot, operator access or manual client login. Project work arrives in the next phase.

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

The application emits `Strict-Transport-Security: max-age=31536000`. Preserve it at HTTPS termination; browsers enforce HSTS after a secure response. Local HTTP checks establish header emission only. This policy does not include subdomains or request preload.

## First boot and operator access

An installation without an operator redirects its public, login and dashboard pages to `/setup`. Complete the four steps: operator account, live installation verification, branding, completion. Setup uses environment-owned connections and never collects or stores provider credentials. Absent email and payments are skipped. File storage checks the writable local directory or configured private S3 bucket; bucket reachability alone does not prove file upload permissions. With Resend configured, **Verify installation** explicitly submits one nonpersonal test to Resend's fixed `delivered@resend.dev` address; it uses sending quota. The wizard distinguishes provider acceptance from inbox delivery, and shows failures. Merely supplying environment variables is reported as configured but unverified by the status API. No external account is needed for the manual workflow.

If email verification fails while the database succeeds, their results remain separate. Retry email verification or explicitly select **Continue with manual login links**. This choice permits setup without disabling the configured Resend adapter; correct its environment configuration before relying on email. A failed database check always blocks continuation.

Use a unique password of at least eight characters, up to 72 UTF-8 bytes (bcrypt's input limit). Setup shows length guidance and stores a bcrypt cost-12 hash. Email is trimmed and lowercased. Brand name, colour, welcome copy and default currency are saved together with the sole operator and initial session. Logo upload and invoice numbering controls arrive with their actual consumers; there is no unconnected upload control.

After setup, `/setup` returns 404 and repeated or competing setup API writes return 409. PostgreSQL serializes creation and enforces the singleton. Keep a new installation private until its operator has completed setup; first boot establishes installation ownership.

Use `/login` for the operator and `/portal/login` for clients. `/dashboard` and its management APIs independently require a current operator session; `/portal` independently requires a current client session. `/api/auth/me` returns only the authenticated identity, ignoring supplied client IDs. Navigation exposes only installed pages. Logout deletes that session immediately. Operator sessions use random 32-byte tokens, store only SHA-256 digests and expire after 90 inactive days. Authenticated requests renew the stored operator expiry; dashboard responses and the current-user endpoint renew its browser cookie. Client sessions use the same protected cookie with separate hash storage and expire after a fixed 90 days; requests do not extend them. Signing in to another account in the same browser replaces the cookie; use separate browser profiles for separate accounts. Cookies are HTTP-only, SameSite=Lax, Path=/ and Secure in production. Production internet access requires HTTPS; Chromium treats localhost as a secure development exception.

All JSON writes require an exact `Origin` matching `APP_ORIGIN`; an arbitrary Host or forwarded header cannot change that authority. Browser forms send JSON to ordinary API endpoints. Set the public origin correctly and restart after environment changes. No proxy-origin inference is performed.

Login allows five attempts per TCP peer within 15 minutes in the single long-lived process. The native Next Node API reads the request socket and ignores caller-supplied forwarding headers. Behind a reverse proxy, requests share that proxy peer's bucket: configure stricter client-IP throttling at your edge when needed. The application never trusts unvalidated `X-Forwarded-For`/`X-Real-IP`. In-memory counters reset on application restart; there is no distributed/replica claim.

The PostgreSQL named volume holds all database state. Ordinary `docker compose stop`/`start` or application recreation preserves it. Do not remove database volumes to resolve startup errors. Initial role creation runs only on an empty volume; editing `.env` does not rotate an existing database password. Use PostgreSQL's account administration to rotate it, then update the matching URL and restart the application. A partially initialized volume requires inspection and repair by its owner, not an automatic reset.

The app receives `DATABASE_URL`, `DATABASE_SSL`, `APP_ORIGIN` and optional Resend variables; migration/admin passwords are not passed to it. The separate one-off migration service receives the migration URL. Schema changes are always explicit. Never expose the tools image or migration credentials as the application runtime.

## Appearance and installation branding

The public page, setup, both login flows, operator workspace and client portal share a warm paper/ink light palette and a charcoal dark palette, contrasting serif display type and compact sans-serif controls. **Appearance** offers System, Light and Dark everywhere these screens are delivered. System is the initial default and follows live device changes. A choice is stored in this browser under `yinsen-theme`, applied by a static head script before paint and shared across navigation/reload. If browser storage refuses a write, the current tab still applies the choice and shows **Not saved**; it cannot promise persistence after reload. This preference is local presentation state, separate from authentication and operator settings.

`src/app/globals.css` is the consumed design contract. `--canvas`, `--surface`, `--surface-muted`, `--text`, `--muted`, `--border`, `--danger` and `--danger-surface` drive page/panel/table/input/error presentation. `--brand-colour` comes from the saved installation colour; derived `--accent-ink`, `--accent-soft` and `--action-ink` drive links, selected navigation, primary controls and focus. The bounded neutral mixtures keep extreme white/black/yellow brand choices readable in both modes. `--font-body`, `--font-display` and `--text-small/body/title` drive the actual type hierarchy; `--space-1` through `--space-5` and `--control-height` drive density; `--radius-small`, `--radius` and `--shadow` drive control/panel shape. Every variable has an installed consumer. There is no font CDN or build-time font download.

Brand name, colour, welcome copy and default currency already persist through setup and reach real screens; brand name/colour also reach login email. Palette/type/density/shape variables can currently be adjusted in installation source, followed by a rebuild. Validated persisted operator controls for those choices, logo and full business settings remain Task 4.3. Basic theme capability was explicitly moved forward into Phase 1 by Neels on 17 October 2026. The sidebar uses delivered navigation only, with account/logout at the bottom on desktop and a usable account row on narrow screens.

## Managing clients

Open **Clients** in the dashboard. Create or edit a name, email, company, phone, private notes and up to 20 custom text fields. Search name/email/company, sort by name or newest, and move through ten clients per page. Email is trimmed/lowercased and remains unique across active and archived clients. If the email already exists, include archived clients in search and restore the original identity. Private notes/custom fields remain operator-only.

Changing a client's normalized email invalidates all pending login links in the same transaction. Generate a fresh link for the new address; existing sessions remain active until expiry, revocation or archive. API PATCH updates preserve omitted fields and allow explicit empty values to clear optional fields.

On a client's detail page, **Generate login link** creates a single-use link valid for 24 hours. Copy it and share it privately. The token is in the URL fragment, so ordinary HTTP requests/referrers do not transmit it. The recipient opens the branded confirmation page and chooses **Continue to portal**; only that same-origin POST redeems the token. Link previews do not consume it. No token is stored in plaintext. An expired or already-used link requires a new one.

The detail page shows active sessions, their creation/expiry and **Revoke session**. Revocation immediately denies future requests. **Archive client** asks for confirmation and atomically revokes every session and pending link. Cancel/Escape returns keyboard focus to its trigger before submission; dismissal is disabled while the request runs. Restoration preserves history and allows new links; it never restores old access. Client activity records creation, edits, archive/restore, link generation, email request/acceptance/failure, login and revocation. It is visible only to the operator.

Access cleanup runs during actual application startup and every 60 minutes thereafter. It removes expired operator/client sessions and magic-link tokens in one transaction, logs only counts, catches failures and retries at the next scheduled run. Authorization always checks expiry immediately, even before cleanup. Run one application process; in-memory throttles and this schedule are not distributed services.

## Projects, lock-in and milestones

Open **Projects** in the dashboard to create a project with a name, scope, budget, currency and optional dates. Choose one primary client and any additional active members. The primary client approves milestones; every member can review and confirm project lock-in. Budgets are entered in the selected currency and persisted as integer smallest units, with a maximum of 2,147,483,647 units. Values outside the currency's decimal precision or range are rejected rather than rounded or cleared. Changing the installation's default currency does not convert an existing project.

New manually created projects start as **draft**. Add milestones, then choose **Send for lock-in**. A member opens the shared project in their portal, reviews the displayed scope, budget and milestones, and confirms **Review and lock in**. The project becomes **active** for both parties. The operator can pause an active project and resume a paused project. Repeated or invalid transitions return a conflict and require reviewing current state. Clients cannot perform operator edits, pause/resume or project deletion.

Milestones start **pending**. The operator edits names, descriptions and due dates, uses keyboard-accessible **Move up**/**Move down** controls to order them, and moves work to **in progress**, then **review**. Review can return to in progress for changes. Only the project's current primary client can approve a milestone in review. The operator can edit, order or delete an approved milestone, but cannot impersonate approval or reset its approved status. Milestone deletion asks for confirmation; project deletion instead preserves its stored history and hides the project from both workspaces.

Project lists include status filters and actual milestone progress. Details show members, scope, dates, milestones and persisted activity. Project access is checked independently on every page, API and event subscription. Unknown and foreign projects receive the same denial. Removing a member invalidates their open detail view; archiving a client or revoking a session also rechecks open subscriptions immediately. Expiry is additionally checked every five seconds. Restoration never revives revoked sessions.

Live updates use the installation's single application process and authenticated `/api/events` stream. Events contain invalidation signals; each view reloads current authorized server data. Reconnecting refreshes authoritative truth, including changes missed while disconnected. Disconnection hides stale detail while reconnecting. A database failure shows a useful recovery state and **Reload workspace** or **Try again**; restore the service and retry. Graceful application shutdown closes streams and their timers so Next can finish stopping, and browsers reconnect after restart. No replica or distributed event guarantee is claimed.

Apply the checked-in project migration explicitly with the documented migration command before starting this source. Task 2.1 adds no environment variables or external provider requirement. Against a deliberate synthetic fixture and an already running ordinary application, `npm run test:projects` exercises the installed HTTP routes and persisted project/milestone facts, including scoped reads, conflicting lock-in/approval, membership removal and deletion. It uses the same fixture guard as the inherited checks.

## Proposals and agreement

Either party can choose **Propose a project** in their general client conversation. Enter the project scope, normal currency amount and ordered milestones. **Counter** prefills every term and allows adding, removing and editing milestones. Only the receiving party can accept, counter or reject the latest pending version. Earlier cards retain their history and show their current chain outcome; accepted cards link to the actual project.

Review the confirmation before accepting or rejecting. Cancel or Escape closes the dialog; a failure retains the terms or confirmation for retry. Acceptance creates one **active** project with the agreed budget, currency, immutable agreement snapshot, primary client and ordered milestones in one database transaction. It requires no further lock-in. Manually created projects still follow their existing draft/lock-in workflow. Later project edits do not rewrite the original agreement snapshot. Retry an unchanged action after a lost response to recover its confirmed outcome without duplicate persistence.

## Optional Resend email

Supply both `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`, or omit both. Partial or malformed configuration refuses startup. Prefer a Sending-access API key restricted to your verified sending domain; no account-management key or domain ID is required. Use a bare sender email address. Configure and verify that sender's domain in Resend, disable click tracking for authentication links, and restart after environment changes. Compose passes the optional variables into the same runtime as source running. No key is collected in setup or stored in the database.

Neels's standing workflow is to edit the private root `.env` with `nano .env`, keep it mode 0600 and keep secrets out of chat. Report only presence and validation, never the key value; no in-chat secret modal is expected. A Resend account's login address does not automatically authorize it as a sender. The selected installation sender is `portal@abyss.global`; actual sending and receipt were proved with that domain. Resend's `onboarding@resend.dev` is an account-owner test sender, not the installation's current sender.

With these values, `/portal/login` offers **Email me a login link**. Requests normalize email and return the same conditional response for active and unknown addresses, waiting at least eleven seconds around the provider's ten-second abort limit. This bounds the observed provider timing signal; it is not an arbitrary-load constant-time guarantee. For active clients, Yinsen submits a branded, HTML-escaped single-use link valid for 15 minutes. Failed, rate-limited, malformed or timed-out provider responses invalidate that pending token and create operator-visible **Email delivery failed** activity; the operator can still generate a manual link. The client still receives the generic request response, with guidance to check the inbox or contact the operator, rather than a client-specific delivery error. Neels explicitly approved this privacy policy on 17 October 2026, resolving A13-04's contract decision. Provider API acceptance does not prove delivery to an inbox. A later acceptance-activity write failure leaves the submitted link valid and emits a safe `email.accepted_activity_failed` log instead of claiming delivery failed. There is no automatic resend after uncertain results.

Native auth endpoints use the actual TCP peer, ignoring forwarded headers. Email requests permit three per normalized email and ten per peer per 15 minutes; verification permits thirty per peer. Setup verification permits five per peer. A reverse proxy shares its peer bucket; configure edge limits for individual visitors. These counters reset on restart.

Contracts checked 17 October 2026: [Resend send email](https://resend.com/docs/api-reference/emails/send-email), [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys), [sending API keys](https://resend.com/docs/api-reference/api-keys/create-api-key), and [official test addresses](https://resend.com/docs/dashboard/emails/send-test-emails). Independent QA exercised both deterministic external-boundary failure fixtures and the real configured production-source path. The authorized inbox received the domain email, its received MIME rendered readably and its direct received link authenticated the correct client, with replay/logout denial. The separately authorized built-in check received real provider acceptance at the synthetic sink; that result does not claim inbox delivery. These observations establish the tested sender/recipient journey, not universal deliverability. See [final QA proof](qa/phase-01.md#final-live-provider-proof-and-acceptance--17-october-2026).

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

## Messages and private attachments

The operator's client detail contains the general conversation; clients open it at `/portal/messages`. Both sides also share each current project's thread. Notifications and project unread counts come from persisted per-message read receipts. Only messages whose read marker becomes visible are marked read; loading a thread does not clear unseen earlier messages. Current sessions, active client identity and current project membership authorize every message, read receipt, live stream and attachment download. Attachments have no invoice or release gate.

`STORAGE_DRIVER=local` is the default. `STORAGE_LOCAL_PATH` defaults to `./data/uploads`; `npm start` resolves this against the source checkout before Next's standalone server changes directory. Ordinary rebuilds therefore leave uploads outside `.next`. Compose mounts the named `uploads_data` volume at `/app/data/uploads`, owned by the nonroot application user. Preserve and back up both database and uploads volumes; replacing an application container does not replace either volume. S3 mode also needs a writable local staging directory at this path.

For private S3-compatible storage, set `STORAGE_DRIVER=s3`, `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, `STORAGE_S3_ACCESS_KEY` and `STORAGE_S3_SECRET_KEY`. For R2, use region `auto` and set `STORAGE_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`. AWS's standard endpoint is selected by omitting `STORAGE_S3_ENDPOINT` and supplying the AWS region. Other compatible implementations may use their HTTPS endpoint; localhost HTTP is accepted for private development fixtures. Partial credentials, S3 values with the local driver, unsafe endpoints or invalid limits refuse startup. Never enter keys in chat or the browser; edit the private server environment and restart.

Keep the bucket private. The application uses the pinned AWS SDK's private Put/Get operations and streams downloads through its own currently authorized endpoint; it creates no public or presigned file URL. Credentials also need DeleteObject for failed-send cleanup and HeadBucket for the explicit setup check. Setup's bucket reachability check does not establish upload permissions. Cloudflare R2 has actual upload/download/rollback proof in Task 2.2; AWS S3 and other vendors share the selected API contract but have not been independently exercised here.

`MAX_UPLOAD_SIZE_MB` accepts 1–100 and defaults to 100 per file, with at most five files per message. The server bounds actual streamed bytes, including chunked requests, and stages files on disk rather than buffering a multipart message in memory. Accepted extensions are text/Markdown/CSV, PDF, PNG/JPEG/GIF/WebP, ZIP and DOCX/XLSX/PPTX. Filename, executable-extension, declared MIME and content-header checks run before persistence. Downloads use attachment disposition, `nosniff` and private/no-store caching.

Failed sends keep the browser's text and selected files. Retry without editing the draft reuses its send identifier, so a lost response cannot create a second message, attachment or activity. A successful retry republishes the scoped refresh notification. Newly created files are removed after a transaction callback fails. A lost commit acknowledgment has an uncertain outcome: private files are retained, `storage.commit_uncertain` records only generated keys, and the same-send retry recovers any committed message. If operator intervention is required, inspect those exact keys against stored attachment references before removal. Process interruption can also leave private `.staging` files; no background task deletes uncertain files or unrelated objects. Keep the original path/bucket/credentials available when moving storage, and migrate referenced bytes before changing them; changing configuration alone does not move existing files.

## Engineering checks

The test suite requires a deliberate isolated synthetic PostgreSQL fixture, fully migrated. Never point it at customer data or assume the preserved root `.env` is the test fixture. Before importing any tests or querying data, the shared test guard requires `TEST_ISOLATED_DATABASE=1` and explicit runtime/migrator URLs for the same uniquely named `yinsen_test_*` database at the same server/port. It refuses the preserved `yinsen` database even with the flag set. Access tests establish a synthetic operator if absent and preserve it for repeatable runs. `npm test` checks actual schema, privilege denials, setup conflicts, password/session behavior and rollback as well as configuration, logs and rendering. Load the fixture environment before running checks, for example:

```sh
set -a
. /absolute/private/fixture.env
set +a
TEST_ISOLATED_DATABASE=1 npm run check
TEST_ORIGIN=http://localhost:3007 npm run test:http
TEST_ISOLATED_DATABASE=1 npm run test:access
TEST_ISOLATED_DATABASE=1 npm run test:clients
TEST_ISOLATED_DATABASE=1 npm run test:projects
TEST_ISOLATED_DATABASE=1 npm run test:messages
TEST_ISOLATED_DATABASE=1 npm run test:proposals
```

The HTTP checks exercise an ordinary already-running installation. `test:access` and `test:clients` expect the synthetic operator defined in `tests/access.test.ts` and a freshly started process for their attempt windows; they deliberately exhaust relevant throttles. Run each with a fresh process when repeating it. They inspect actual stored expiry/revocation, role denial, CSRF, rollback, token races and forwarded-header rotation. Await startup readiness. `test:http` supports either first boot or a branded landing page. To prove first-boot concurrency, run `TEST_ISOLATED_DATABASE=1 npm run test:setup-race` against a separate, migrated installation with zero operators/settings. It refuses completed setup and never resets data; its successful run retains one synthetic operator/settings/session. Tests run serially with one worker, including actual database failure/recovery for cleanup. Owned database/HTTP behavior is never mocked; deterministic Resend tests replace only the external HTTP boundary.

See [engineering gates](as-built/engineering-gates.md) for the mapping and exercised failures. These checks support installed functional proof; they do not establish future project, invoice or provider behavior.

`test:messages` exercises the ordinary running general/project routes, real attachment checksums, current-session/foreign denial, send idempotency, pagination/search, explicit read races, count/type/size/chunked bounds and revocation. Its configured synthetic upload limit is deliberately small; it must never run against the canonical installation. Private Task 2.2 evidence also retains actual browser failure/retry, source restart/rebuild, configured R2 and lost-commit-acknowledgment checks.

`test:proposals` uses the ordinary general-message HTTP transport and real PostgreSQL to check both proposal directions, repeated counters, active creation, exact agreed terms, replay/races, rollback/retry and current authorization/CSRF. Structured actions use bounded JSON on that existing POST route; ordinary text and attachment sends remain multipart, including text-only sends. Run each installed security suite against a freshly started isolated runtime so earlier attempt limits do not contaminate its window.

## Current Abyss development resources

Run this checkout only on `abyssbox` at `/home/neels/development/yinsen` (SSH alias `abyss`), with Node 22.21.1/npm 10.9.4. The restored private database is `yinsen_abyss-postgres-1`, volume `yinsen_abyss_postgres_data`, bound to `127.0.0.1:55432`. Its Compose configuration belongs to the preserved migration fixture; inspect its labels/mounts before operation. Use `docker start yinsen_abyss-postgres-1` when it is stopped. Do not recreate it from this repository's generic Compose file or remove its volume. The private root `.env` selects this fixture.

Task 1.1's separate synthetic rehearsal is project `yinsen_t11_remote_20261017`, database port 55433 and app port 3006. Its retained private configuration and service ownership records live under ignored `.local/remote-11/`; neither passwords nor raw logs belong in commits. Port 3001 belongs to another project.

The current canonical production preview is `http://localhost:3000`, source build `ONQhJHtaYOeOl2p0-Ng7C`, parent/group 2478888/server 2478923. The patched synthetic source preview is `http://localhost:3027`, parent/group 2478974/server 2479012, using retained guarded `yinsen_test_phase23_container_20261017` on 55434. Exact start ticks, cwd, effective configuration and logs are in `.local/patch-phase02-task23/service-{3000,3027}.json`; `canonical.json` binds preserved canonical facts. Verify records and actual identities before stopping only owned groups. Both source processes share standalone output: stop both before a production build. Reviewed migration 0005 preserves the original singleton/five prior migration hashes, adds the reviewed sixth hash and leaves fourteen canonical business-table counts zero. The private root environment is unchanged, mode 0600; actual children have no test/tool credential keys. Earlier task/patch process records are historical.

The audited implementation baseline retains isolated nonroot R2 container `yinsen-phase23-r2-20261017` on loopback `http://localhost:3026`, image `sha256:9e7599f48ac2d88ea19c4817cd719ea392ba6bc54aaa769f191487e45c4e8890`, independently built container build `XGfN3bvEpPh4AoyLfruEu`. This historical image does not contain the coordinated patches; fresh QA must build/exercise current images. Its guarded database is `yinsen_test_phase23_container_20261017` on synthetic PostgreSQL 55434. Exact runtime, eligible proposal/client states, known R2 attachment and private environment paths are bound under `.local/phase-02-task-2.3/handback.json`. The stopped local app container and its `yinsen_phase23_uploads_20261017` volume are retained; the replacement R2 container also serves those earlier local bytes. Source 3025 and proxy 55435 are stopped. Earlier Task 2.1/2.2 previews and the old Task 2.2 R2 container are stopped and preserved with all databases, images, volumes and recovery evidence. These identities are synthetic; never adopt them into canonical. Phase 3 handoff/work is held until Neels explicitly requests it.

Task 1.2's PostgreSQL fixture on 55434 also holds prior Task 1.3/QA/Phase 2 databases; retain them. The immutable Task 1.3 fixture `yinsen-task13-app-final2` completed natural hourly cleanup at 02:39:31 UTC on 17 October, with unchanged business rows. QA stopped only that exact container and verified exited/PID 0; its data/image and before/after identity remain preserved in `.local/qa-01/hourly-observation-observed.json`, `hourly-closure.json` and `hourly-stopped.json`. Do not casually adopt or reset prior fixtures. These development fixtures are not a deployment.

Run heavy builds/checks/browser suites serially across agents. On this server, the shared `/tmp` user quota was exhausted despite free disk space. Use a task-owned on-disk temporary directory, for example `mkdir -p .local/tmp` then `TMPDIR="$PWD/.local/tmp" npm run check`; do not clean another workload's files. The shared Docker buildx activity file was root-owned, so rehearsal used a private `DOCKER_CONFIG` directory under `.local/remote-11/docker-cli` rather than modifying shared Docker configuration. This changes the CLI state location, not the Docker daemon or application configuration.
