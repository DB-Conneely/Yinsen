Phase 3 — Production Hardening (post-QA Cycle 27).** Steps 38–46 supersede and decompose the open Step 37 sub-tasks (37.1, 37.2, 37.4, 37.9, 37.10, 37.11, 37.12, 37.13). Step 37 is closed by supersession; all remaining work is specified below. Steps 38–40 require Docker (PostgreSQL 16 via compose). No step may be marked complete without its live-verification evidence recorded in `cortex-context/build-log.md`.

## Step 38 — Test Database Provisioning and Boot Verification

### What
Provision PostgreSQL 16 via Docker Compose, apply migrations, boot the application for the first time, and prove `/api/health` and core routes respond. This converts the codebase from "compiles and passes mocked tests" to "runs". Hard gate for every subsequent step.

### Deliverables
- `docker-compose.test.yml` at repo root: a `postgres:16-alpine` service on host port `5433` (avoid local 5432 clashes), `POSTGRES_DB=client_portal`, `POSTGRES_USER`/`POSTGRES_PASSWORD` set, a named volume, and a `pg_isready` healthcheck.
- `.env.test` with `DATABASE_URL=postgresql://...@localhost:5433/client_portal` plus the minimum env required to boot in self-hosted mode. Document every required variable in the file with comments.
- `package.json` scripts: `db:up` (`docker compose -f docker-compose.test.yml up -d --wait`), `db:down` (with `-v`), `db:migrate` (Drizzle migrate against `DATABASE_URL`).
- Apply all migrations EXCEPT `drizzle/migrations/0001_rls_policies.sql`. The 0001 policies must not be applied until the request path arms `app.tenant_id` (Step 40) — applying them now breaks every managed-mode query. Implement the exclusion via a documented mechanism (migration journal ordering, a separate `db:migrate:rls` script for 0001, or equivalent) and record the chosen mechanism in the build log.
- Boot verification in self-hosted mode: `npm run build` then `npm run start` with `.env.test` loaded. Verify `GET /api/health` returns 200 with its expected body, and at least three page routes (login, dashboard entry, portal entry) return 200 or a deliberate 302 — no 5xx.
- Append boot evidence to `cortex-context/build-log.md`: exact commands, status codes, and any errors fixed to achieve first boot.

### Acceptance Criteria
- `npm run db:up` brings up healthy Postgres 16 and `db:down` tears it down cleanly
- `npm run db:migrate` applies cleanly from an empty database, with 0001 verifiably excluded
- `npm run build` exits 0; the started app serves `GET /api/health` → 200
- Three named page routes return non-5xx, recorded with status codes in the build log
- Any code defects found at first boot are fixed in this step, with the full Vitest suite still green
- `.env.test` documents every variable required for boot

## Step 39 — Seed Script

### What
An idempotent seed script that populates the Step 38 database with realistic data for both platform modes, sufficient to exercise every E2E flow (auth, projects, invoices in all statuses, managed-mode tenant/tier data).

### Deliverables
- `scripts/seed.ts` using the project's Drizzle schema and typed error conventions. Seeds: at least two tenants (for managed-mode isolation checks), one agency user and one client user per tenant with documented credentials in the script header, projects, and invoices covering draft, sent, and paid statuses with multi-line items.
- Idempotency: safe to run repeatedly — upsert by stable keys or guarded truncate-and-insert that refuses to run when `NODE_ENV=production`.
- `package.json` script: `db:seed` running the script against `DATABASE_URL`.
- Output via the project logger or `process.stdout.write` — no `console.log`.

### Acceptance Criteria
- `npm run db:seed` exits 0 against a freshly migrated Step 38 database
- Running `db:seed` twice produces no errors and no duplicate rows
- Seeded credentials log in successfully against the booted app, and the dashboard renders seeded projects and invoices (evidence in build log)
- Script refuses to execute when `NODE_ENV=production`
- `tsc --noEmit`, Biome, and the full Vitest suite remain green

## Step 40 — Arm Database-Level Tenant Isolation (RLS)

### What
Wire `setTenantIdSql()` into the managed-mode request path so every tenant-scoped query runs inside a transaction with `SET LOCAL app.tenant_id` applied, then apply migration 0001 and prove cross-tenant denial against the live database. Closes the audit finding that `src/lib/platform/rls.ts:68` has zero production call sites.

### Deliverables
- A transaction wrapper in the DB access layer (`src/lib/db`) that, when `getPlatformMode()` is managed, executes `setTenantIdSql()` with the authenticated tenant id as the first statement of every transaction. All tenant-scoped query paths route through this wrapper — no direct unscoped client usage remains on managed paths.
- Self-hosted mode is untouched: no GUC set, no behavioural change, Step 38 boot still healthy.
- Apply `drizzle/migrations/0001_rls_policies.sql` via the Step 38 mechanism.
- Live verification script or test: with policies applied, a managed-mode query without the GUC set returns zero rows / fails closed, and a tenant-A session attempting to read tenant-B rows (with application WHERE scoping deliberately bypassed) returns zero rows.
- Unit tests for the wrapper (mode branching, GUC statement ordering, error propagation as typed `AppError`).

### Acceptance Criteria
- Grep proves the wrapper (invoking `setTenantIdSql`) has production call sites covering every managed-mode tenant-scoped query path
- 0001 is applied; managed-mode queries succeed with the GUC set and fail closed without it, demonstrated against live Postgres
- Cross-tenant read attempt against the live database returns zero rows (evidence in build log)
- Self-hosted boot verification from Step 38 re-run and still healthy
- Full Vitest suite green; `tsc --noEmit` and Biome green

## Step 41 — Invoice UI Components

### What
Build the five invoice components the product's money flow depends on. The API layer (`/api/invoices/*`, `useInvoices`) exists and is tested — this step builds the interface on top of it.

### Deliverables
- `src/components/invoice/InvoiceForm.tsx` — create/edit form: client selection, issue/due dates, line items via LineItemEditor, currency via the existing formatting utilities (no new hardcoded `"GBP"` beyond established defaults), validation with typed errors surfaced inline.
- `src/components/invoice/LineItemEditor.tsx` — add/remove/reorder line items; quantity × unit price per line; running subtotal and total recomputed on change.
- `src/components/invoice/InvoicePreview.tsx` — read-only rendered invoice: parties, line items, totals, status badge.
- `src/components/invoice/PaymentButton.tsx` — client-side payment entry point; states for payable, processing, paid, and failed; wired to the existing payment API.
- `src/components/invoice/SettlementModal.tsx` — agency-side mark-as-paid/settle flow with confirmation.
- All components: named exports, fully typed props, functions ≤40 lines per CLAUDE.md, existing loading/error-state patterns.
- Component tests for each: form validation paths, line item math (add/remove/totals), preview rendering against fixture data, PaymentButton state transitions, settlement confirm/cancel.

### Acceptance Criteria
- All five components exist under `src/components/invoice/` with passing tests
- Line item totals math is covered by explicit assertions (multi-line, edge quantities, currency formatting)
- Zero forbidden patterns introduced (`any`, `console.log`, `TODO`, raw `throw new Error`)
- `tsc --noEmit`, Biome, and the full Vitest suite green

## Step 42 — Invoice Pages

### What
Replace all five placeholder invoice routes with real pages composed from Step 41 components, and verify the create → send → view flow in the browser against the booted, seeded app.

### Deliverables
- `src/app/(dashboard)/invoices/page.tsx` — invoice list: table with number, client, status, amount, due date; status filter; link to `invoices/new`.
- `src/app/(dashboard)/invoices/[id]/page.tsx` — InvoicePreview plus status-appropriate actions (send, SettlementModal).
- `src/app/(dashboard)/invoices/new/page.tsx` — InvoiceForm wired to create via the existing API.
- `src/app/(portal)/invoices/page.tsx` — client's invoice list scoped to the authenticated client.
- `src/app/(portal)/invoices/[id]/page.tsx` — InvoicePreview plus PaymentButton for payable statuses.
- All pages use `useInvoices`/existing API hooks, with loading and error states matching established dashboard patterns.
- Browser verification against the booted app with Step 39 seed data: create an invoice, send it, view it in the portal. Evidence (routes exercised, outcomes) appended to the build log.

### Acceptance Criteria
- Grep across `src/app/**/invoices/**` finds zero placeholder `<div>` stubs
- Each of the five pages renders real data against the booted, seeded app (evidence in build log)
- The agency create → send and portal view flows complete in the browser without errors
- Page-level tests cover list rendering, detail rendering, and the new-invoice submit path
- `tsc --noEmit`, Biome, and the full Vitest suite green

## Step 43 — Managed Billing UI

### What
Give the managed-SaaS revenue model a user-facing entry point: a billing-status endpoint, a billing hook, and a subscription section in settings consuming the existing `/api/billing/subscribe` and `/api/billing/portal` endpoints.

### Deliverables
- `GET /api/billing/status` — returns current tier, subscription state, and usage versus tier limits (reusing the Step 37.6 `enforceLimit`/storage tracking data). Managed mode only; in self-hosted mode it responds per the project's established mode-gating convention. Typed response, typed errors.
- `src/hooks/useBilling.ts` — fetches billing status; exposes loading/error/data plus `subscribe(tier)` and `openPortal()` actions hitting the existing endpoints.
- `src/components/settings/SubscriptionSection.tsx` — current plan, usage meters against tier limits, upgrade/downgrade buttons (→ checkout session), and a manage-billing button (→ Stripe portal). Mounted in the settings page, rendered only in managed mode.
- Tests: endpoint in both platform modes, hook behaviour, component rendering and action wiring (Stripe mocked per existing test conventions).

### Acceptance Criteria
- `GET /api/billing/status` is typed and tested in both modes
- SubscriptionSection renders current tier and usage against the booted app in managed-mode env (evidence in build log); absent in self-hosted mode
- Upgrade action produces a checkout session via the existing `/api/billing/subscribe` path (mocked in tests; live wiring evidenced in build log)
- `tsc --noEmit`, Biome, and the full Vitest suite green

## Step 44 — Integration Test Suite Against Real Postgres

### What
A real-database integration suite that retires the mock-only coverage gap: actual Drizzle queries, migrations, transactions, and armed-RLS tenant isolation executed against the compose database. This replaces the evidentiary role of the mock-Proxy `tenant-isolation.test.ts` and the string-assertion `rls.test.ts`.

### Deliverables
- `src/__tests__/integration/` with a dedicated Vitest project/config reading `DATABASE_URL` from `.env.test`, and a `test:integration` script in `package.json`. The unit suite remains untouched and runnable without a database.
- Coverage: migrations apply from scratch; CRUD through real Drizzle for tenants, users, projects, and invoices; transaction commit/rollback behaviour; armed-RLS isolation — cross-tenant reads denied by the database with executed queries, in both with-GUC and without-GUC configurations.
- Per-test data isolation (per-test schema, transaction rollback, or truncation between tests) so the suite is order-independent and repeatable.
- One documented command chain runs everything from cold: `db:up` → `db:migrate` → `test:integration`.

### Acceptance Criteria
- `npm run test:integration` passes against a freshly created compose database, twice in a row
- RLS denial is proven by an executed cross-tenant query returning zero rows — not by SQL-string assertions
- All four core entities have real-query CRUD coverage; transaction rollback is asserted
- Unit suite unchanged and green without a database running
- The cold-start command chain is documented in README and verified by execution

## Step 45 — Function-Length Refactors

### What
Clear the recorded CLAUDE.md function-length debt as an isolated, behaviour-preserving slice, before the final E2E gate so end-to-end runs validate the refactored code.

### Deliverables
- `src/components/settings/GeneralSettings.tsx` — split `AccountForm` into separate account-details and password-change components; all functions ≤40 lines.
- `src/components/settings/BrandingForm.tsx`, `src/components/onboarding/CompletionFlow.tsx` (or actual path), `SessionsList.tsx` — decompose to ≤40-line functions using the established component patterns.
- `src/lib/analytics/queries.ts` — decompose `getDashboardStats` into named, individually testable query helpers; the public signature is unchanged.
- Zero behaviour change: no test assertions weakened or deleted; tests may be added or restructured to match new component boundaries.

### Acceptance Criteria
- Every function in the five listed files is ≤40 lines (verified by review against CLAUDE.md)
- No existing test assertion was weakened or removed; suite count is equal or higher
- `getDashboardStats` callers are unmodified
- `tsc --noEmit`, Biome, full Vitest suite, and `test:integration` all green

## Step 46 — E2E Execution and Final Verification

### What
Execute Playwright against the booted, seeded application for the first time, fix everything it surfaces, and close with the full five-gate verification chain green against live infrastructure. This is the ship gate.

### Deliverables
- Documented E2E run procedure: `db:up` → `db:migrate` → `db:seed` → `npm run build` → `npm run start` → `npm run test:e2e`.
- Playwright coverage executed (extending the existing suite where thin): agency login and dashboard load; invoice create → send (agency); invoice view and payment entry point (client portal); billing settings render (managed mode); logout.
- Every failure fixed: application bugs fixed in the app; a test is modified only where the test itself is wrong, with each such change justified in the build log.
- README quickstart updated to the verified run procedure and validated by following it verbatim from a clean checkout state.
- Final gate chain executed in one recorded session: `tsc --noEmit`, Biome, Vitest unit, `test:integration`, `test:e2e` — all green. Run summary appended to the build log.

### Acceptance Criteria
- Playwright passes against the live app: 0 failures, 0 skipped, with the run summary in the build log
- All five named flows are covered and passing
- Every test modification is individually justified in the build log
- README quickstart reproduces a working app when followed verbatim
- All five gates green in a single recorded session — the product boots, seeds, and survives its own E2E suite