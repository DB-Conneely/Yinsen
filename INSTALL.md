# Install Yinsen

Yinsen runs one long-lived application process with PostgreSQL16 and persistent
private files. The default installation needs no payment, email or storage
account. Docker Engine and Compose2.24.4 or newer are required; use a Linux host
with at least2 CPU cores,4GiB available RAM and10GiB free disk for a source build,
plus space for your database, uploads and backups. These are rehearsal resources,
not measured capacity guarantees. The qualified image platform is Linux amd64;
other architectures require their own build and qualification.

Keep a fresh installation private until its operator account has been created.
Choose a unique Compose project and unused loopback ports for each installation.
Never reuse another installation's project, volumes or private configuration.

## Build from a committed source checkout

Use Node22.21.1/npm10.9.4 to build/qualify the distribution. No registry account is
needed. Run from the repository root with a clean committed working tree:

```sh
npm ci
RELEASE_SEQUENCE=1 npm run package:build
npm run package:verify
```

`RELEASE_SEQUENCE` is the release authority's positive monotonically increasing
integer, **not** an inferred ordering of Git SHAs or the package version. GitHub
uses its workflow run number. A local rehearsal may use1 for its first candidate;
do not mix that local lineage with published releases. Both images contain the
exact commit, sequence, package version and complete ordered migration hashes.
The command builds runtime and tools once, verifies their matching identity and
saves `.local/package/{artifacts.json,images.tar}`. That private output contains
no installation credentials. Do not edit the manifest or rebuild after qualification.

Keep the workflow name and run-number lineage stable. A renamed/recreated
workflow or a manually allocated sequence needs an operator-chosen number above
every previously installed release. Reusing a sequence with different source or
images is invalid; an update consumer must reject it.

## Create a private installation

Use the example file; the following commands preserve an existing `.env` by
selecting a separate private file:

```sh
mkdir -p .local/installation
chmod 700 .local/installation
cp -n .env.example .local/installation/installation.env
chmod 600 .local/installation/installation.env
```

Edit that file. Replace its three password placeholders with **three separate**
values from `openssl rand -hex 32`. Set `COMPOSE_PROJECT_NAME=yinsen_personal`,
`APP_PORT=3000`, `POSTGRES_PORT=55432`, `POSTGRES_DB=yinsen` and
`APP_ORIGIN=http://localhost:3000`, choosing different names/ports if occupied.
Source development URLs must match those DB/port/password choices.
Read the runtime/tools `id` values in `.local/package/artifacts.json` and add
`YINSEN_RUNTIME_IMAGE=sha256:…` and `YINSEN_TOOLS_IMAGE=sha256:…` to this private
file. These are exact engine-local image IDs, not tags or portable registry
digests. Docker's classic and containerd stores can expose different IDs for
the same underlying artifact. The saved archive preserves the build-host image
bytes; its local manifest is not a cross-store installation contract.
For a published release use the
approved `release.json` references `ghcr.io/owner/repository-runtime@sha256:…`
and matching tools reference; explicitly `docker pull` both first. Never select
an unqualified mutable tag. Registry references are the portable transport
contract. On a target, resolve each approved pinned reference with `docker image
inspect`, compare the actual serving container's `.Image` to that **target-local**
ID and compare its health release identity to the approved manifest. The manifest's
`id` retains the builder's provenance; it is not a cross-engine equality promise.
`package:verify` makes the same distinction: local IDs must match exactly, while
registry references resolve locally and their embedded release identity must match.

```sh
export COMPOSE_FILE=compose.yaml:compose.release.yaml
export COMPOSE_ENV_FILES=.local/installation/installation.env
docker compose up -d --wait postgres
docker compose run --rm migrate
docker compose run --rm migrate npm run db:status
docker compose run --rm migrate
docker compose up -d --wait app
```

The second migration is a safe replay. Open the configured localhost origin.
Complete the four-step setup: operator account, **Verify installation**, branding,
then dashboard. Log out and log in. Create a client and use **Generate login link**
in their workspace; open that private link in a separate browser and confirm it.
Keep links secret and use each once. Create a project/milestone, request client
lock-in, upload a deliverable, send a linked invoice and record its full manual
settlement. The client's released download must match your original file.

`/api/health` must return200, `healthy` and the same release identity as the
manifest. The runtime has only its database/provider credentials; admin/migration
credentials stay in separate tools. Startup refuses a missing/pending/mismatched
schema. It never silently migrates. After `docker compose restart app`, confirm
your sessions, settings, projects, invoices and private file downloads remain.
Named `postgres_data` and `uploads_data` volumes persist across container
replacement. Never remove volumes to repair an installation.

Compose binds to loopback. Public use requires a separately configured HTTPS
reverse proxy and exact matching `APP_ORIGIN`; cookie writes reject another
origin. Production cookies require HTTPS, with localhost allowed for development.
No business-site embedding or public deployment has been qualified in this phase.

## Optional configuration

Infrastructure secrets belong only in the private server environment. Restart
after changing it. Partial optional provider configuration refuses startup.

| Path                                     | Required values and limits                                                                                                                       | Qualification                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Local files/manual links/manual payments | Defaults; writable persistent upload volume;1–100MB/file, at most5 message attachments                                                           | Fresh installed zero-provider journey                                                |
| Cloudflare R2                            | `STORAGE_DRIVER=s3`, bucket, region`auto`, endpoint, access/secret; private bucket; Put/Get/Delete and HeadBucket access; writable local staging | Actual inherited nonproduction R2 upload/download/delete/logo proof; vendor-specific |
| Other S3-compatible vendors              | Same configuration; AWS normal region and omit endpoint                                                                                          | Contract implemented; independent vendor proof absent                                |
| Resend                                   | Both `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`; verified domain; disable click tracking for login links                                          | Inherited actual received-mail/link proof; setup acceptance alone is not delivery    |
| Direct Stripe Checkout                   | Both server secret and endpoint signing secret; no browser key                                                                                   | Inherited native sandbox payment/webhook/replay proof; no live-payment claim         |

Stripe uses SDK23.0.0/API`2026-09-30.endive`. Endpoint
`/api/webhooks/stripe` requires `checkout.session.completed`,
`checkout.session.expired`, `checkout.session.async_payment_succeeded` and
`checkout.session.async_payment_failed`. For a sandbox listener on this host:

```sh
stripe listen --latest --events-from @self --forward-to http://localhost:3000/api/webhooks/stripe --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed
```

Use its own signing secret, restart and verify a real sandbox Checkout payment,
persisted invoice/payment and released bytes. Browser returns grant no payment.
For public HTTPS use that actual endpoint's secret and matching API version.
Changing database password strings does not rotate existing database roles.
Changing storage configuration does not migrate retained objects: keep their
original stores accessible. Logos are public; private files remain authorized.

**Settings** changes brand identity, welcome copy, business details, currency and
invoicing defaults, colour/typography/density/corners and readable light/dark
surfaces. Browser theme preference is separate. Issued invoices retain historical
identity, appearance and numbering. Automatic-update permission defaults off;
saving it starts no installation or restart. Follow [OPERATIONS.md](OPERATIONS.md)
for the actual backup/restore, secret-manager and target-local update commands.

## Qualify the exact distribution

Install the pinned Chromium browser once (`npx playwright install --with-deps
chromium` on CI; `npx playwright install chromium` where system dependencies
already exist), then:

```sh
npm run package:qualify
```

The **same** repository command is used by GitHub CI. It creates uniquely named
synthetic Compose resources on localhost3211/PostgreSQL55451 (override with
`QUALIFICATION_APP_PORT`/`QUALIFICATION_POSTGRES_PORT`), migrates the exact tools
image, runs strict host gates against a separate guarded test database, then
qualifies the exact nonroot runtime with installed HTTP/security/domain suites
and the real Chromium setup/operator/manual-client journey. Suites run serially,
with separate fresh settings data and restarts for rate-limit windows. A failure
returns nonzero and produces no passing receipt. Owned apps/databases stop on
exit; volumes, synthetic records, screenshots and private stage logs remain under
`.local/package/qualification-*`. Do not publish these private raw artifacts.

The qualifier explicitly selects a1MB test cap to exercise the existing boundary
regressions; ordinary installations retain the100MB default. It compares the
actual serving container image ID and health release identity to the candidate,
rather than accepting healthy status alone.

## User-controlled CI and publication

`.github/workflows/ci-release.yml` runs ordinary source qualification with
read-only repository permission and no deployment secrets. Its explicit manual
dispatch may request publication through the protected `release` environment.
Configure that environment with your required reviewers before use. The publish
job builds, qualifies and publishes on **one runner**, using the same repository
commands as ordinary CI. It verifies the exact manifest/receipt again, pushes
those images **without rebuilding after qualification**, and writes pinned GHCR
references into `release.json`. Failed qualification stops the job before any
registry login, push or release publication. This avoids treating a builder's
engine-local image ID as portable across workflow runners.
Repository/registry names come from `github.repository`; no repository identity
or production credentials are baked into the application.

No agent triggers or publishes this workflow. Live GitHub execution, publication,
production installation and website integration remain **UNVERIFIED**, reserved
for separately authorised Phase5.5. Local qualification does not establish them.
