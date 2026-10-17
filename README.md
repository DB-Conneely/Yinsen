# Yinsen

A self-hosted client portal for freelancers and small agencies: one operator, client accounts and private shared project work. Yinsen is MIT licensed.

Development is ongoing. Operator/client access, projects, milestones, messages, private attachments, negotiated proposals and versioned deliverables are implemented. Invoices, payments and the remaining product features are still in development; integrated verification continues.

## Run with Docker Compose

Use Docker Engine with Compose v2. From the repository root:

```sh
cp .env.example .env
chmod 600 .env
```

Replace the three password placeholders with **three separate** values generated using `openssl rand -hex 32`. Set `APP_ORIGIN` to `http://localhost:3000` for a local installation, or your HTTPS origin. Keep `.env` private.

```sh
docker compose up -d --wait postgres
docker compose build app
docker compose --profile tools build migrate
docker compose run --rm migrate
docker compose run --rm migrate npm run db:status
docker compose up -d --wait app
```

Open `http://localhost:3000` and complete setup: operator account, installation checks and branding. Keep a new installation private until its operator is created. `/api/health` returns HTTP 200 with `data.status: healthy` when the database and schema are ready.

Compose binds the application and database to loopback. Internet-facing installations need an HTTPS reverse proxy and the matching `APP_ORIGIN`. Cookie-protected writes require that exact origin. The application sends HSTS headers; production authentication requires HTTPS, with localhost supported for development.

## Use the portal

The operator signs in at `/login`. Create clients in the dashboard, then generate a single-use login link from their client workspace and share it privately. Clients open the link, confirm sign-in and use their portal. Manual links work without an email provider. Archive/revocation removes access immediately; restoring an account requires fresh access.

Create a project, choose its primary and additional client members, add milestones and send it for lock-in. An eligible member reviews and agrees the scope; the project becomes active. The operator can pause/resume work, and only the current primary client can approve a milestone in review.

General conversations and project conversations support private messages and attachments. Either party can propose a project in the general conversation, counter its terms or reject it. Accepting the latest proposal creates one active project with the agreed budget and ordered milestones. Manually created projects keep their separate lock-in workflow.

Upload deliverables from a milestone in the project workspace, choosing a new file or a version of an existing deliverable. Every version starts locked. The operator can release or relock each version independently; clients can download only currently released versions, including in the version history. Deliverables use the same private local or S3 storage and per-file size limit as attachments, with one file per upload. Ordinary message attachments remain available without a release or payment gate.

Run one long-lived application process. Live updates, rate limits and scheduled access cleanup use that process; multiple replicas are not currently supported.

## Configuration and storage

Start from [`.env.example`](.env.example). Provider credentials stay in server environment variables; the browser setup does not collect them. Restart the application after environment changes.

Local storage is the default and requires no external account. Compose persists PostgreSQL in `postgres_data` and uploads in `uploads_data`. Source running uses `./data/uploads` by default, outside build output. Preserve and back up both database and files. Stopping or replacing an application container preserves the named volumes; removing volumes removes their data. Changing initial database passwords in `.env` does not rotate passwords in an existing database.

For private S3-compatible storage, set `STORAGE_DRIVER=s3` and supply `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, `STORAGE_S3_ACCESS_KEY` and `STORAGE_S3_SECRET_KEY`. Cloudflare R2 uses region `auto` and `STORAGE_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`. AWS's standard endpoint is selected by omitting the endpoint and supplying its region. R2 has actual upload/download proof; other vendors have not been independently exercised here. Keep the bucket private. Credentials need Put/Get/Delete object access and HeadBucket for setup verification. S3 mode also requires writable local staging storage.

Attachments stream through currently authorized application endpoints. They have no public file URL or payment gate. `MAX_UPLOAD_SIZE_MB` accepts 1–100 MB per file, with at most five files per message. Failed submissions preserve drafts for retry. Keep original storage available when moving providers: changing configuration does not move existing files.

Email is optional. Supply both `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`, or omit both. Use a verified sender domain and disable click tracking for authentication links. The setup verification button submits a test email to Resend's fixed test address and uses provider quota; provider acceptance and actual inbox delivery are distinct. Manual client links remain available if email is unavailable.

## Source development

Use Node.js 22.21.1 and npm 10.9.4. Dependencies are pinned in `package-lock.json`; the application uses Next.js, React, TypeScript, PostgreSQL and Drizzle.

```sh
npm ci
docker compose up -d --wait postgres
npm run db:migrate
npm run db:status
npm run dev
```

Source commands load the root `.env`. The example database URLs select separate runtime and migration roles. Use explicit migrations; startup refuses a pending or incompatible schema. To run the built source:

```sh
npm run build
npm start
```

Stop development/built source processes sharing `.next` before another build. Run heavy builds/checks serially.

## Engineering checks

`npm run check` runs strict types, lint, formatting, tests, unfinished-marker checks and a production build. Database tests require a deliberately isolated, fully migrated `yinsen_test_*` database, matching runtime/migrator URLs and `TEST_ISOLATED_DATABASE=1`. Load that private fixture environment first; never use installation/customer data for tests.

```sh
TEST_ISOLATED_DATABASE=1 npm run check
```

Installed HTTP suites are `test:http`, `test:access`, `test:clients`, `test:projects`, `test:messages` and `test:proposals`. They require an ordinary running isolated application and its matching `TEST_ORIGIN`. Start a fresh fixture process for each security suite's rate-limit window. `test:setup-race` requires a separate empty, migrated fixture and preserves the setup it creates.

Passing checks supports actual functional verification through the browser, database and configured provider. Component placement, visual hierarchy, responsive layouts, keyboard/focus, failure/retry and private data access also require review in the running application.
