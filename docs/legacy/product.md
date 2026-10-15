# Technical Vision & Architecture — Source of Truth

**Product:** Unnamed Client Portal
**Creator:** Abyss Global
**Document Type:** Complete system specification — zero-ambiguity technical source of truth
**Purpose:** This document defines every detail of the system. An AI agent reading this document should be able to build the entire product without asking a single clarifying question.

---

## 1. PRODUCT IDENTITY

### What This Is

An open source client portal for freelancers and small agencies. One codebase, two deployment modes: self-hosted (open source, MIT licence) and managed SaaS (multi-tenant, revenue-generating platform).

The system provides freelancers with a professional interface for managing client relationships end-to-end: project tracking, deliverable handoff, messaging, invoicing, and analytics. Clients get a clean, minimal portal where they view projects, download deliverables, communicate with their freelancer, and pay invoices.

### Who It's For

**Primary:** Solo freelancers earning £3-15k/month. Technical or semi-technical. They can deploy a Docker container or sign up for the managed service. They want to look professional to clients without paying for Basecamp or HoneyBook.

**Secondary:** Small agencies (2-10 people). They need multi-client project support and aggregated analytics.

**Explicitly not the target:** Enterprise. No SSO, no complex RBAC, no compliance features.

### Two Deployment Modes

**Self-hosted (open source):** Freelancer deploys their own instance. Single tenant. They configure their own Stripe, email, and storage. Full data ownership. MIT licence.

**Managed SaaS:** Multi-tenant platform operated by Abyss Global. Freelancers sign up, get a subdomain, connect Stripe via OAuth, and everything works immediately. Email, storage, and infrastructure managed centrally. Revenue model: tiered transaction fees on invoice payments plus optional monthly subscriptions.

Both modes run the same codebase. A single environment variable (`PLATFORM_MODE=self-hosted` or `PLATFORM_MODE=managed`) controls the fork. Feature code calls a platform service abstraction (`getPlatformConfig()`) and receives the correct behaviour without knowing which mode it's running in.

### Three Surfaces (Plus Admin)

**Surface 1 — Landing Page (public).** The freelancer's branded page. Unauthenticated. Hero with brand name and tagline, feature overview, client login CTA, freelancer login link. Pulls branding from settings so each instance feels custom.

**Surface 2 — Client Portal (authenticated, client role).** What the client sees after logging in. Scoped entirely to their projects. Project list, project detail with milestones and deliverables, invoice list with payment, messaging (client-level and project-level), proposal negotiation.

**Surface 3 — Freelancer Dashboard (authenticated, freelancer role).** The operator's command centre. All clients, all projects, revenue analytics, project management, invoice creation and tracking, deliverable uploads, messaging, settings.

**Surface 4 — Admin Dashboard (managed mode only, admin role).** Platform management. Tenant list, platform revenue, system health, subscription management.

### What the Open Source Repo Proves

The repository ships with a `cortex-context/` directory containing the build directive, build log, and implementation plan. The README includes a build report: total build time, cost, lines of code, test count. This demonstrates that Abyss Global delivers production-quality software autonomously at unprecedented speed.

---

## 2. TECH STACK

Every technology choice is final. No alternatives, no "or" options.

### Language & Runtime

TypeScript everywhere. Single language from database schema to API to frontend. One type system, one build pipeline, one deployment artifact.

### Framework

Next.js (App Router) with `standalone` output mode. Single process serves all surfaces and API routes. No separate backend service.

### Database

PostgreSQL 16. The only datastore. No Redis, no secondary databases.

### ORM

Drizzle ORM. Typed schema definitions, auto-generated migrations, compiles to clean SQL. Schema files are the single source of truth — API validation and frontend types derive from them.

### Validation

Zod. Schema validation for all API inputs, environment variables, and form data. Shared type inference with Drizzle.

### Auth

Custom-built. Two distinct flows: email/password for freelancer, magic link for clients. bcrypt for password hashing (cost factor 12). `crypto.randomBytes(32)` for session and magic link tokens. HTTP-only cookies. Sessions stored in PostgreSQL. No NextAuth, no Auth.js.

### Styling

Tailwind CSS with `darkMode: 'class'` strategy. shadcn/ui primitives copied into the repo — fully owned, not a runtime dependency. Accessible building blocks for buttons, modals, dropdowns, tables, forms.

### Frontend State

React Query (TanStack Query) for server state — caching, background refetching, optimistic updates, pagination. Zustand for UI state — sidebar collapse, theme preference, notification state. Clean separation: React Query handles "data from the API," Zustand handles "UI things."

### Icons

Lucide React. Clean, consistent, tree-shakeable.

### File Storage

Abstracted behind a `StorageAdapter` interface with two implementations: `LocalStorageAdapter` (default, filesystem) and `S3StorageAdapter` (Cloudflare R2 recommended, also compatible with AWS S3, MinIO, DigitalOcean Spaces). Selected via `STORAGE_DRIVER` environment variable.

### Payments

Stripe SDK (`stripe` npm package). Self-hosted: direct Stripe API keys. Managed: Stripe Connect with platform fees. Stripe Billing for managed SaaS monthly subscriptions.

### Email

Resend. Transactional email for magic links and invoice notifications. Self-hosted: freelancer configures their own Resend API key (optional — system works without it via manual link sharing). Managed: centralised platform Resend account.

### Testing

- Vitest — unit and integration tests for business logic, utilities, data access.
- Supertest — API route testing against actual handlers with a test database.
- Playwright — end-to-end tests for critical user flows across both client and freelancer surfaces.

### Linting & Formatting

Biome. Single tool replacing ESLint + Prettier. Zero config, opinionated defaults.

### Logging

Pino. Structured JSON in production, pretty-printed in development.

### Security Headers

Helmet middleware.

### Package Manager

pnpm.

### Complete Dependency List

**Runtime:** `next`, `react`, `react-dom`, `typescript`, `drizzle-orm`, `postgres`, `zod`, `bcrypt`, `stripe`, `resend`, `@aws-sdk/client-s3`, `mime-types`, `pino`, `helmet`, `@tanstack/react-query`, `zustand`, `lucide-react`

**Dev:** `drizzle-kit`, `vitest`, `supertest`, `playwright`, `@biomejs/biome`, `pino-pretty`, `tailwindcss`, `@tailwindcss/typography`

**shadcn/ui primitives:** copied into `components/ui/`, not installed as a package.

No other runtime dependencies unless explicitly justified and approved.

---

## 3. DATABASE SCHEMA

All monetary values stored as integers in the smallest currency unit (pence/cents). No floating point. The frontend formats for display.

UUIDs for all primary keys, generated via `gen_random_uuid()`.

All timestamps are `timestamptz` (timestamp with timezone).

Polymorphic `sender_type` / `actor_type` / `user_type` fields used instead of separate foreign keys for freelancer and client references. Simple, works for a two-role system.

Every table except `platform_settings` and `platform_events` includes a `tenant_id` column (uuid, NOT NULL, FK → tenants.id, indexed) in the schema from the start. In self-hosted mode, a single tenant row exists and `tenant_id` is set automatically — the column is inert but present. In managed mode, `tenant_id` is actively used for multi-tenant scoping, and row-level security in Postgres enforces tenant isolation at the database level. One schema, one migration, both modes.

### Table: tenants

Always called `tenants` regardless of deployment mode. In self-hosted mode, this table has a single row. In managed mode, it has one row per freelancer/agency on the platform. All columns exist in both modes — managed-only columns are nullable with defaults, inert in self-hosted mode.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| email | varchar(255) | NOT NULL, UNIQUE | Login credential |
| password_hash | varchar(255) | NOT NULL | bcrypt hash |
| name | varchar(255) | NOT NULL | Display name |
| company | varchar(255) | nullable | Business name |
| phone | varchar(50) | nullable | |
| avatar_url | varchar(500) | nullable | Profile image path |
| subdomain | varchar(63) | nullable, UNIQUE | Tenant portal subdomain. Set in managed mode. |
| stripe_connected_account_id | varchar(255) | nullable | Stripe Connect account. Used in managed mode. |
| subscription_tier | varchar(20) | NOT NULL, default 'starter' | starter, pro, agency. Inert in self-hosted. |
| subscription_stripe_id | varchar(255) | nullable | Stripe Billing subscription ID |
| subscription_status | varchar(20) | NOT NULL, default 'active' | active, past_due, cancelled. Inert in self-hosted. |
| storage_used_bytes | bigint | NOT NULL, default 0 | Running storage total. Tracked in managed mode. |
| emails_sent_this_month | integer | NOT NULL, default 0 | Monthly email counter. Tracked in managed mode. |
| emails_reset_at | timestamptz | NOT NULL, default now() | Counter reset timestamp. Used in managed mode. |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

### Table: clients

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| name | varchar(255) | NOT NULL | |
| email | varchar(255) | NOT NULL, UNIQUE | Used for magic link login |
| company | varchar(255) | nullable | |
| phone | varchar(50) | nullable | |
| notes | text | nullable | Freeform notes |
| metadata | jsonb | default '{}' | Custom key-value fields |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |
| deleted_at | timestamptz | nullable | Soft delete |

Indexes: `idx_clients_email` on email. `idx_clients_deleted_at` partial WHERE deleted_at IS NULL.

### Table: projects

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| name | varchar(255) | NOT NULL | |
| description | text | nullable | |
| status | varchar(50) | NOT NULL, default 'draft' | Enum values below |
| budget | integer | nullable | Total budget in smallest currency unit |
| currency | varchar(3) | default 'GBP' | ISO 4217 |
| start_date | date | nullable | |
| due_date | date | nullable | |
| proposal_message_id | uuid | nullable, FK → messages.id | Links to accepted proposal |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |
| deleted_at | timestamptz | nullable | Soft delete |

Indexes: `idx_projects_status` on status.

**Project status enum and state machine:**

- `draft` — created by freelancer, not yet sent to client
- `pending_lockin` — sent to client for review and confirmation
- `active` — both parties confirmed ("Locked In")
- `paused` — temporarily halted
- `pending_approval` — freelancer submitted for completion
- `completed` — client accepted completion
- `archived` — filed away after completion

**Valid transitions:**

```
draft → pending_lockin (freelancer sends for lock-in)
pending_lockin → active (client locks in)
active → paused (freelancer pauses)
paused → active (freelancer resumes)
active → pending_approval (freelancer submits for approval)
pending_approval → completed (client accepts)
pending_approval → active (client disputes — reason logged)
completed → archived (freelancer archives)
```

Invalid transitions return 409 CONFLICT.

### Table: project_clients

Join table — multiple clients can be on one project.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| project_id | uuid | NOT NULL, FK → projects.id | |
| client_id | uuid | NOT NULL, FK → clients.id | |
| role | varchar(50) | NOT NULL, default 'member' | primary or member |
| added_at | timestamptz | NOT NULL, default now() | |

PK: composite (project_id, client_id).

The `primary` client is the decision-maker: only the primary client can accept/dispute project completion and approve milestones. All clients can view everything and send messages. Invoices are addressed to specific clients (via `invoices.client_id`) regardless of project membership.

### Table: milestones

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| project_id | uuid | NOT NULL, FK → projects.id | |
| name | varchar(255) | NOT NULL | |
| description | text | nullable | |
| status | varchar(50) | NOT NULL, default 'pending' | pending, in_progress, review, approved |
| position | integer | NOT NULL | Ordering within project |
| due_date | date | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

Index: `idx_milestones_project_id` on project_id.

### Table: deliverables

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| milestone_id | uuid | NOT NULL, FK → milestones.id | |
| parent_deliverable_id | uuid | nullable, FK → deliverables.id | Self-reference for versioning |
| version | integer | NOT NULL, default 1 | Auto-incremented per parent chain |
| filename | varchar(255) | NOT NULL | Original upload filename |
| storage_key | varchar(500) | NOT NULL | Path in storage backend |
| file_size | bigint | NOT NULL | Bytes |
| mime_type | varchar(100) | NOT NULL | |
| released | boolean | NOT NULL, default false | Client can only download when true |
| uploaded_at | timestamptz | NOT NULL, default now() | |

Indexes: `idx_deliverables_milestone_id` on milestone_id. `idx_deliverables_parent_id` on parent_deliverable_id.

**Release gate:** The `released` flag is the payment gate. When an invoice linked to a milestone is paid (Stripe webhook or manual settlement), the system auto-releases all deliverables on associated milestones. The freelancer can also manually toggle release in either direction.

### Table: messages

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| project_id | uuid | nullable, FK → projects.id | Null for client-level messages |
| client_id | uuid | NOT NULL, FK → clients.id | Always present for scoping |
| sender_type | varchar(20) | NOT NULL | freelancer or client |
| sender_id | uuid | NOT NULL | References tenants.id or clients.id |
| type | varchar(20) | NOT NULL, default 'message' | message, proposal, counter, accept, reject |
| body | text | NOT NULL | Message content |
| proposal_data | jsonb | nullable | Structured proposal content |
| proposal_id | uuid | nullable, FK → messages.id | Links to original proposal |
| created_at | timestamptz | NOT NULL, default now() | |

Indexes: `idx_messages_project_id` on project_id. `idx_messages_client_id` on client_id. `idx_messages_created_at` on created_at.

**Two levels of messaging:**

1. **Client-level:** `project_id` is NULL. General conversation between freelancer and a specific client. Proposals happen here.
2. **Project-level:** `project_id` is set. Conversation scoped to a specific project.

**Proposal message types:**

- `proposal` — structured proposal with `proposal_data` containing: `{ name, description, budget, currency, milestones: [{ name, description, dueDate }] }`
- `counter` — amended proposal, references original via `proposal_id`
- `accept` — accepts the latest proposal/counter in the chain, triggers project auto-creation
- `reject` — declines the proposal

No threading — flat chronological order per project or per client.

### Table: message_attachments

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| message_id | uuid | NOT NULL, FK → messages.id | |
| filename | varchar(255) | NOT NULL | |
| storage_key | varchar(500) | NOT NULL | |
| file_size | bigint | NOT NULL | |
| mime_type | varchar(100) | NOT NULL | |
| uploaded_at | timestamptz | NOT NULL, default now() | |

Index: `idx_message_attachments_message_id` on message_id.

### Table: invoices

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| project_id | uuid | nullable, FK → projects.id | Nullable for standalone invoices |
| client_id | uuid | NOT NULL, FK → clients.id | Denormalised for direct querying |
| invoice_number | varchar(50) | NOT NULL, UNIQUE | Sequential: INV-001 |
| status | varchar(50) | NOT NULL, default 'draft' | draft, sent, paid, settled, overdue, cancelled |
| currency | varchar(3) | NOT NULL, default 'GBP' | ISO 4217 |
| amount | integer | NOT NULL | Total in smallest currency unit |
| due_date | date | nullable | |
| sent_at | timestamptz | nullable | |
| paid_at | timestamptz | nullable | |
| stripe_checkout_session_id | varchar(255) | nullable | |
| stripe_payment_intent_id | varchar(255) | nullable | |
| notes | text | nullable | |
| settlement_data | jsonb | nullable | Manual settlement: { amountReceived, paymentMethod, reference } |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |
| deleted_at | timestamptz | nullable | Soft delete |

Indexes: `idx_invoices_client_id` on client_id. `idx_invoices_project_id` on project_id. `idx_invoices_status` on status.

**Invoice status enum:**

- `draft` — created, not yet sent
- `sent` — dispatched to client (email if configured)
- `paid` — payment confirmed via Stripe webhook
- `settled` — payment confirmed manually (off-platform)
- `overdue` — past due date, set by scheduled task
- `cancelled` — soft deleted

`paid` and `settled` are both terminal "money received" states. Analytics treats them identically for revenue calculations.

**Invoice amount:** defaults to sum of line items but is editable. The freelancer can adjust for discounts, rounding, or cases where line items are illustrative.

### Table: invoice_line_items

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| invoice_id | uuid | NOT NULL, FK → invoices.id ON DELETE CASCADE | |
| description | varchar(500) | NOT NULL | |
| quantity | decimal(10,2) | NOT NULL, default 1 | |
| unit_price | integer | NOT NULL | Smallest currency unit |
| amount | integer | NOT NULL | quantity × unit_price |
| position | integer | NOT NULL | Ordering |

Index: `idx_invoice_line_items_invoice_id` on invoice_id.

### Table: invoice_milestones

Join table — many-to-many between invoices and milestones.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| invoice_id | uuid | NOT NULL, FK → invoices.id ON DELETE CASCADE | |
| milestone_id | uuid | NOT NULL, FK → milestones.id | |

PK: composite (invoice_id, milestone_id).

### Table: sessions

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| user_type | varchar(20) | NOT NULL | freelancer or client |
| user_id | uuid | NOT NULL | |
| token | varchar(255) | NOT NULL, UNIQUE | crypto.randomBytes(32) |
| expires_at | timestamptz | NOT NULL | |
| created_at | timestamptz | NOT NULL, default now() | |

Indexes: `idx_sessions_token` on token. `idx_sessions_expires_at` on expires_at.

### Table: magic_link_tokens

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| client_id | uuid | NOT NULL, FK → clients.id | |
| token | varchar(255) | NOT NULL, UNIQUE | crypto.randomBytes(32) |
| expires_at | timestamptz | NOT NULL | 15 min for email, 24 hours for manual |
| used_at | timestamptz | nullable | Set on use, single-use |
| created_at | timestamptz | NOT NULL, default now() | |

Index: `idx_magic_link_tokens_token` on token.

### Table: activity_events

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| project_id | uuid | nullable, FK → projects.id | Null for account-level events |
| actor_type | varchar(20) | NOT NULL | freelancer, client, or system |
| actor_id | uuid | nullable | Null for system events |
| event_type | varchar(100) | NOT NULL | e.g. project.completed, invoice.paid |
| metadata | jsonb | default '{}' | Event-specific data |
| created_at | timestamptz | NOT NULL, default now() | |

Indexes: `idx_activity_events_project_id`, `idx_activity_events_event_type`, `idx_activity_events_created_at`.

### Table: settings

Single row per tenant. Instance-wide configuration.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| brand_name | varchar(255) | NOT NULL, default 'Portal' | |
| brand_colour | varchar(7) | default '#000000' | Hex |
| logo_url | varchar(500) | nullable | |
| default_currency | varchar(3) | NOT NULL, default 'GBP' | ISO 4217 |
| invoice_prefix | varchar(10) | NOT NULL, default 'INV' | |
| invoice_next_number | integer | NOT NULL, default 1 | |
| payment_instructions | text | nullable | |
| portal_welcome_text | text | nullable | |
| updated_at | timestamptz | NOT NULL, default now() | |

### Table: platform_settings (managed mode only)

Single row. Platform-level configuration owned by the admin.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| platform_name | varchar(255) | NOT NULL | |
| platform_domain | varchar(255) | NOT NULL | Base domain for subdomains |
| stripe_platform_secret_key | varchar(255) | NOT NULL | |
| stripe_platform_publishable_key | varchar(255) | NOT NULL | |
| stripe_platform_webhook_secret | varchar(255) | NOT NULL | |
| resend_api_key | varchar(255) | NOT NULL | |
| email_from_address | varchar(255) | NOT NULL | |
| updated_at | timestamptz | NOT NULL, default now() | |

### Table: platform_events (managed mode only)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| event_type | varchar(100) | NOT NULL | tenant.signup, tenant.upgraded, payment.processed, payment.fee_collected |
| tenant_id | uuid | nullable, FK → tenants.id | |
| metadata | jsonb | default '{}' | |
| created_at | timestamptz | NOT NULL, default now() | |

### Relationships Summary

```
tenant (1) ──── manages ────→ clients (many)
client (many) ←─ join table ─→ projects (many)  [via project_clients]
project (1) ───────────────────→ milestones (many)
project (1) ───────────────────→ messages (many)   [project-level]
client (1) ────────────────────→ messages (many)   [client-level]
project (1) ───────────────────→ invoices (many)
project (1) ───────────────────→ activity_events (many)
milestone (1) ─────────────────→ deliverables (many)
milestone (many) ←─ join table ─→ invoices (many)  [via invoice_milestones]
message (1) ───────────────────→ message_attachments (many)
invoice (1) ───────────────────→ invoice_line_items (many)
deliverable (1) ←── versions ──→ deliverable (self-ref via parent_deliverable_id)
message (1) ←── proposals ─────→ message (self-ref via proposal_id)
```

---

## 4. AUTH SYSTEM

### Freelancer Authentication (Email/Password)

1. Freelancer navigates to `/login`.
2. Submits email and password.
3. Server queries `tenants` table by email.
4. Compares password against `password_hash` using bcrypt (cost factor 12).
5. On failure: returns generic "Invalid email or password." No indication of which was wrong.
6. On success: generates session token via `crypto.randomBytes(32).toString('hex')`, inserts session row with `user_type: 'freelancer'`, sets `expires_at` to 90 days from now.
7. Sets HTTP-only cookie (`pylon_session`) containing the session token.
8. Redirects to `/dashboard`.

### Client Authentication (Magic Link)

1. Client navigates to `/portal/login`.
2. Submits email address.
3. Server queries `clients` table by email.
4. If found: generates token via `crypto.randomBytes(32).toString('hex')`, stores in `magic_link_tokens` with 15-minute expiry. Sends email via Resend (if configured) with login link.
5. If not found: same "Check your email" response. No information leakage.
6. Client clicks link → server verifies token (exists, unused, not expired) → marks `used_at = now()` → creates session → sets cookie → redirects to `/portal/projects`.

**Magic link tokens are single-use.** Once verified, cannot be reused even within expiry window.

**When email is not configured (self-hosted):** The client-facing login page shows "Contact your freelancer for a login link." The freelancer generates links manually from the dashboard — "Generate Login Link" button on each client, displays URL in a modal with "Copy Link" button. Manually generated links have 24-hour expiry (vs 15 minutes for email-requested).

### Session Management

**Cookie configuration:** `HttpOnly: true`, `Secure: true` (production), `SameSite: Lax`, `Path: /`. Cookie name: `pylon_session`.

**Session duration:**

- Freelancer: 90 days, sliding. Every authenticated request resets `expires_at`. Only expires after 90 consecutive days of inactivity.
- Client: 90 days, fixed from login.

**Explicit logout:** deletes session row, clears cookie.

**Session invalidation rules:**

- Freelancer password change: all freelancer sessions deleted.
- Client soft-deleted: all client's sessions deleted. Immediate access revocation.
- Client restored: `deleted_at` set to null. Client can request new magic link. All historical data intact.

**Active sessions visibility:** freelancer settings page shows active client sessions (name, email, created, expires) with per-session "Revoke" button.

**Session cleanup:** in-process scheduled task runs on startup then every 60 minutes. Deletes expired sessions and expired magic link tokens.

### Rate Limiting

In-memory rate limiter using a Map keyed by IP address with time-windowed counters.

- Login endpoint: 5 attempts per IP per 15 minutes.
- Magic link endpoint: 3 requests per email per 15 minutes. 10 requests per IP per 15 minutes.
- On limit: 429 response with "Too many attempts. Try again in X minutes."

### Request Context

Auth middleware attaches to every request:

```typescript
type AuthContext = {
  userId: string       // uuid
  userType: 'freelancer' | 'client'
  email: string
  name: string
}
```

### Authorization Model — Two-Layer Middleware

**Layer 1 — Auth Middleware (identity):** Reads cookie, validates session, attaches AuthContext. Invalid/expired: 401 on API, redirect on pages. Extends freelancer session expiry on each request.

**Layer 2 — Authorization Middleware (permissions):** Per-route role checking and data scoping.

**Access rules:**

| Route | Freelancer | Client |
|---|---|---|
| /api/clients | full access | DENIED |
| /api/projects | all projects | own projects only |
| /api/projects/:id | full access | own project only |
| /api/projects/:id/milestones | full access | own project only |
| /api/projects/:id/messages | full access | own project only |
| /api/deliverables/:id/download | always allowed | own + released only |
| /api/milestones/:id/approve | DENIED | primary client, own project |
| /api/invoices | all invoices | own invoices only |
| /api/invoices/:id/pay | DENIED | own invoice only |
| /api/analytics/* | full access | DENIED |
| /api/settings | full access | DENIED |

**Client scoping:** When `userType = 'client'`, every query includes `WHERE EXISTS (SELECT 1 FROM project_clients WHERE project_id = X AND client_id = session.userId)`. Injected by middleware, not per-handler. Client requesting a resource belonging to another client receives 404, not 403 — no information leakage.

**Client write permissions are limited to:** sending messages (own projects), approving milestones (primary client, own projects), accepting/disputing project completion (primary client), paying invoices (own invoices).

**Clients cannot:** delete anything, edit anything the freelancer created, access admin/dashboard routes, see other clients' data, upload deliverables.

### First Boot — Setup Wizard (Self-Hosted)

On first start with empty database (no row in tenants table):

**Step 1 — Account:** name, email, password (min 8 chars, strength indicator).

**Step 2 — Integrations:** Three cards, each with verify/skip:
- Stripe: secret key, publishable key, webhook secret. "Verify Connection" button makes test API call.
- Email (Resend): API key, from address. "Send Test Email" button sends to freelancer's email.
- Storage: toggle Local (default, no config) / Cloud (S3/R2 fields + "Test Connection").

Each card shows three states: not configured (grey), verifying (loading), configured (green checkmark).

**Step 3 — Brand & Customise:** brand name, brand colour, logo upload, default currency, invoice prefix. Live preview card. "Use Defaults" shortcut.

**Step 4 — Complete:** summary of what's configured/skipped, "Go to Dashboard" button, next steps guidance.

### Managed Onboarding (Managed Mode)

**Step 1 — Account:** name, email, password. Creates tenant with `subscription_tier: 'starter'`.

**Step 2 — Connect Stripe:** "Connect Stripe" button → Stripe Connect OAuth. Skip option.

**Step 3 — Your Portal:** subdomain selection (validated for uniqueness, lowercase alphanumeric + hyphens, min 3 chars) with live preview. Brand name, colour, logo, currency, invoice prefix.

**Step 4 — Complete:** summary, portal URL, "Go to Dashboard."

---

## 5. API CONTRACTS

### Global Conventions

**Base path:** `/api`

**Response envelope (all endpoints):**

```json
{
  "data": { ... } | [ ... ] | null,
  "meta": { "page": 1, "limit": 20, "total": 47 } | null,
  "error": null | { "code": "...", "message": "...", "details": { ... } }
}
```

**Pagination:** offset-based. Query params: `page` (default 1), `limit` (default 20, max 100). Response meta includes `page`, `limit`, `total`.

**Sorting:** query params `sort` (field name), `order` (asc/desc). Each endpoint defines valid sort fields.

**Search:** query param `search`. ILIKE across specified columns.

**Timestamps:** ISO 8601 with timezone.

**Monetary values:** integers in smallest currency unit.

**File uploads:** multipart form data. Max 100MB (configurable via `MAX_UPLOAD_SIZE_MB`). Blocked extensions: .exe, .bat, .cmd, .sh, .ps1, .msi, .dll, .com.

**Standard error codes:**

- VALIDATION_ERROR (400)
- UNAUTHORIZED (401)
- PAYMENT_REQUIRED (402) — deliverable not released
- FORBIDDEN (403)
- NOT_FOUND (404)
- CONFLICT (409) — state conflict
- RATE_LIMITED (429)
- INTERNAL_ERROR (500)

### Auth Endpoints

**POST /api/auth/login** — Freelancer email/password login. No auth. Rate limited. Returns user object, sets cookie.

**POST /api/auth/magic-link** — Request magic link. No auth. Rate limited. Same response regardless of email existence.

**GET /api/auth/verify?token={token}** — Verify magic link. No auth. Sets cookie, redirects to portal.

**GET /api/auth/me** — Current user. Auth required.

**POST /api/auth/logout** — Destroy session. Auth required.

**POST /api/auth/change-password** — Freelancer only. Requires current password. Invalidates all freelancer sessions.

**POST /api/setup** — First boot account creation. Only works when no tenant exists. Creates tenant, settings, session.

### Client Endpoints (Freelancer Only)

**GET /api/clients** — List with search, sort, pagination. Computed: projectCount, outstandingAmount. Soft-deleted excluded by default, `?include_deleted=true` to include.

**POST /api/clients** — Create. Validates unique email. Activity event: client.created.

**GET /api/clients/:id** — Full detail with totalRevenue, outstandingAmount.

**PATCH /api/clients/:id** — Update. All fields optional.

**DELETE /api/clients/:id** — Soft delete. Invalidates client sessions.

**POST /api/clients/:id/restore** — Restore soft-deleted client.

### Project Endpoints

**GET /api/projects** — List. Freelancer sees all, client sees own only. Filters: status, client_id. Computed: milestoneCount, completedMilestones, unreadMessages, clientName.

**POST /api/projects** — Create. Freelancer only. Requires clientId (first selected = primary via project_clients).

**GET /api/projects/:id** — Detail with milestones inline, invoice summary, recent message count.

**PATCH /api/projects/:id** — Update. Freelancer only. Status transitions validated against state machine.

**POST /api/projects/:id/lock-in** — Client locks in project. Moves pending_lockin → active.

**POST /api/projects/:id/submit-for-approval** — Freelancer submits. active → pending_approval.

**POST /api/projects/:id/accept** — Primary client accepts. pending_approval → completed.

**POST /api/projects/:id/dispute** — Primary client disputes. Requires reason (min 10 chars). pending_approval → active. Reason logged as message + activity event.

**DELETE /api/projects/:id** — Soft delete. Freelancer only.

### Milestone Endpoints

**GET /api/projects/:id/milestones** — Ordered by position. No pagination. Deliverables inline (latest version, previous versions fetched separately).

**POST /api/projects/:id/milestones** — Create. Freelancer only. Position auto-set to last + 1.

**PATCH /api/milestones/:id** — Update. Freelancer only. Position change triggers reorder.

**POST /api/milestones/:id/approve** — Primary client only. Must be in review status.

**DELETE /api/milestones/:id** — Hard delete. Freelancer only. Blocked if linked to paid invoices. Cascades: deletes deliverables from storage and database.

### Deliverable Endpoints

**GET /api/projects/:id/deliverables** — All versions. Frontend groups by parent chain.

**POST /api/projects/:id/deliverables** — Upload. Freelancer only. Multipart: file + milestoneId + optional parentDeliverableId. Version auto-incremented. Storage key: `deliverables/{projectId}/{milestoneId}/{deliverableId}/{filename}`.

**GET /api/deliverables/:id/download** — File stream. Freelancer: always. Client: own project + released only (402 if unreleased). Activity event: deliverable.downloaded.

**PATCH /api/deliverables/:id** — Update released flag. Freelancer only.

### Message Endpoints

**GET /api/projects/:id/messages** — Paginated (default 50), sorted asc. Filters: since (timestamp), search (ILIKE on body). senderName denormalised.

**POST /api/projects/:id/messages** — Both roles. Multipart: body + optional files (max 5). Creates message_attachments for files. Storage key: `messages/{projectId}/{messageId}/{filename}`.

**GET /api/messages/:id/attachments/:attachmentId/download** — Both roles, own project. No release gate.

Client-level messages use the same endpoints but with `project_id` as a special value or separate endpoints scoped to `client_id`.

### Invoice Endpoints

**GET /api/invoices** — List. Filters: status, client_id, project_id. Freelancer sees all, client sees own.

**POST /api/invoices** — Create. Freelancer only. Body: clientId, projectId (optional), currency, dueDate, notes, milestoneIds (optional), lineItems array, amount (optional override). Auto-generates invoice_number.

**GET /api/invoices/:id** — Full detail with line items and linked milestones. Client view includes all info needed to understand the charge.

**PATCH /api/invoices/:id** — Update. Freelancer only. Cannot edit paid/settled invoices. lineItems array replaces all existing items.

**POST /api/invoices/:id/send** — Send to client. Freelancer only. Draft → sent. Sends email if configured. Creates Stripe Checkout Session.

**POST /api/invoices/:id/pay** — Initiate payment. Client only, own invoice. sent/overdue only. Returns Stripe Checkout URL.

**POST /api/invoices/:id/settle** — Manual settlement. Freelancer only. Body: amountReceived, paymentMethod (bank_transfer, platform_payment, paypal, cash, crypto, other), reference (required). Status → settled. Auto-releases deliverables.

**DELETE /api/invoices/:id** — Soft delete. Freelancer only. Cannot delete paid/settled. Status → cancelled.

### Stripe Webhook

**POST /api/webhooks/stripe** — Receives Stripe events. Verified by signature.

`checkout.session.completed`: look up invoice by checkout_session_id → status to paid → auto-release deliverables on linked milestones → activity event → SSE push.

`checkout.session.expired`: activity event only, no status change.

Idempotent — doesn't double-process already-paid invoices. Always returns 200.

### Analytics Endpoints (Freelancer Only)

**GET /api/analytics/revenue** — Period filter (30d, 90d, 12m, all). Returns: totalRevenue, outstandingAmount, overdueAmount, paidInvoiceCount, averageInvoiceValue, revenueByMonth array, revenueByClient array.

**GET /api/analytics/projects** — Returns: totalProjects, activeProjects, completedProjects, projectsByStatus, averageProjectDuration, completionRate.

**GET /api/analytics/clients** — Returns: totalClients, activeClients, topClients array.

### Activity Endpoint

**GET /api/activity** — Paginated. Filters: project_id, event_type, since. Freelancer sees all, client sees own projects only.

### Settings Endpoints (Freelancer Only)

**GET /api/settings** — Get instance settings.

**PATCH /api/settings** — Update. All fields optional.

**POST /api/settings/logo** — Upload brand logo. Max 5MB.

### Session Management (Freelancer Only)

**GET /api/sessions** — List active client sessions.

**DELETE /api/sessions/:id** — Revoke specific session.

### SSE Endpoint

**GET /api/events/stream** — Server-Sent Events. Auth via cookie.

Connection: persistent HTTP, `Content-Type: text/event-stream`. Heartbeat every 30 seconds.

Event format:
```
event: {eventType}
data: {"projectId":"uuid","payload":{...},"timestamp":"ISO8601"}
```

Event types: `message.new`, `milestone.approved`, `invoice.paid`, `invoice.sent`, `deliverable.uploaded`, `deliverable.released`, `project.submitted_for_approval`, `project.accepted`, `project.disputed`.

Scoping: freelancer receives all events. Client receives only own-project events.

Implementation: in-memory `Map<string, Response[]>`. `pushEvent(userId, event)` writes to all active connections. No external pub/sub. Single process.

Client-side: `EventSource` with auto-reconnect. On reconnect, fetch missed events via `since` param on relevant GET endpoints.

### Health Check

**GET /api/health** — No auth. Returns: status, version, database connectivity, storage availability, email configured, payments configured, uptime.

---

## 6. FRONTEND ARCHITECTURE

### Rendering Strategy

- Landing page: server-rendered (SSR) for SEO.
- Auth pages: server-rendered, minimal JS.
- Dashboard: client-rendered. Heavy interactivity, real-time updates.
- Portal: client-rendered. Interactive messaging, real-time updates.

### Route Structure

```
app/
  (landing)/
    layout.tsx              → marketing layout (nav + footer)
    page.tsx                → /

  (auth)/
    layout.tsx              → minimal centred layout
    login/page.tsx          → /login (freelancer)
    setup/page.tsx          → /setup (first boot)

  (portal)/
    layout.tsx              → portal shell (client nav, SSE, unread state)
    login/page.tsx          → /portal/login (magic link)
    projects/
      page.tsx              → /portal/projects
      [id]/page.tsx         → /portal/projects/:id
    invoices/
      page.tsx              → /portal/invoices
      [id]/page.tsx         → /portal/invoices/:id
    messages/page.tsx       → /portal/messages

  (dashboard)/
    layout.tsx              → dashboard shell (sidebar, topbar, SSE, notifications)
    page.tsx                → /dashboard (overview)
    clients/
      page.tsx              → /dashboard/clients
      [id]/page.tsx         → /dashboard/clients/:id
    projects/
      page.tsx              → /dashboard/projects
      [id]/
        page.tsx            → /dashboard/projects/:id
        messages/page.tsx   → /dashboard/projects/:id/messages
    invoices/
      page.tsx              → /dashboard/invoices
      [id]/page.tsx         → /dashboard/invoices/:id
      new/page.tsx          → /dashboard/invoices/new
    analytics/page.tsx      → /dashboard/analytics
    settings/page.tsx       → /dashboard/settings

  (admin)/                  → managed mode only
    layout.tsx
    page.tsx                → /admin (overview)
    tenants/
      page.tsx              → /admin/tenants
      [id]/page.tsx         → /admin/tenants/:id

  api/                      → all API route handlers
  auth/verify/page.tsx      → /auth/verify?token=xxx
```

### Layout Hierarchy

**Landing Layout:** top nav (brand, links, login CTA), footer.

**Auth Layout:** centred card, brand logo, no navigation.

**Portal Layout:** top horizontal nav — brand logo/name, Projects, Invoices, Messages (with unread dot), user dropdown (profile modal, logout). SSE connection on mount.

**Dashboard Layout:** collapsible left sidebar + top bar. Sidebar: Overview, Clients, Projects, Invoices, Analytics, Settings. Icons with labels (expanded) or icons with tooltips (collapsed). Badge counts on sidebar items. Top bar: page title, search input, notification bell (with badge), user avatar/dropdown. Sidebar state persisted in Zustand.

**Admin Layout:** similar to dashboard, admin-specific nav items.

### React Query Configuration

```typescript
defaultOptions: {
  queries: {
    staleTime: 2 * 60 * 1000,        // 2 minutes fresh
    gcTime: 10 * 60 * 1000,           // 10 minutes cache retention
    refetchOnWindowFocus: true,
    retry: 1
  }
}
```

One custom hook per resource type (useProjects, useClient, useInvoices, etc.). One mutation hook per action (useCreateProject, useSendInvoice, etc.). Every mutation defines `onSuccess` cache invalidation.

### Zustand Stores

**UI Store:** sidebarCollapsed, theme (light/dark/system).

**Notification Store:** notifications array, unreadCount, unreadMessages map (projectId → count). Populated from SSE events. Cleared on view.

### SSE Integration

`useEventStream` hook initialised in dashboard and portal layouts. On each event: add to notification store (toast + centre), invalidate relevant React Query caches. Event-to-cache mapping defined (e.g. message.new → invalidate useMessages, invoice.paid → invalidate useInvoice + useDeliverables + useAnalyticsRevenue).

### DataTable Component

Reusable for every list page. Accepts: query hook, column definitions, search/sort/pagination config, onRowClick, rowActions (3-dot menu items), emptyState, loadingRows. Consistent behaviour everywhere.

### Dark Mode

Tailwind `darkMode: 'class'`. ThemeProvider at app root reads localStorage, applies `dark` class to `<html>`. Toggle cycles: light → dark → system. Semantic colour tokens in Tailwind config.

### Responsive Behaviour

Dashboard sidebar: collapsed by default below 1024px. DataTable: horizontal scroll on narrow viewports. Portal: single-column below 768px. Landing page: fully responsive.

---

## 7. SCREEN-BY-SCREEN UI SPEC

### Auth Screens

**`/setup`** — Four-step wizard (account, integrations, branding, complete). Only appears on first boot. Returns 404 after account exists.

**`/login`** — Centred card, email + password, "Log In" button. Error states: invalid credentials, rate limited.

**`/portal/login`** — Centred card with freelancer branding, email input, "Send Login Link." Same success message regardless of email existence. When email not configured: "Contact your freelancer for a login link."

**`/auth/verify`** — Processes token, redirects. On failure: "This link has expired or already been used" with "Request New Link" button.

### Landing Page

**`/`** — Hero (brand name, tagline from settings, "Client Login" CTA, "Freelancer Login" link), features overview (3-4 cards with icons), footer (brand name, "Powered by" link).

### Client Portal

**`/portal/projects`** — Project cards grouped into Active and Completed. Each card: name, status badge, milestone progress bar, unread message count, due date, budget. Empty state: "No projects yet."

**`/portal/projects/:id`** — Scrollable single page (not tabbed for clients).
- Header: project name, status badge, budget, dates. Lock-In banner when `pending_lockin`. Accept/Dispute banner when `pending_approval`.
- Section 1 — Milestones: ordered list, each with deliverables nested. Released deliverables have download button, unreleased show "Pending release." Primary client sees "Approve Milestone" on `review` status milestones.
- Section 2 — Invoices: list with status, amount, "Pay Now" button for sent/overdue.
- Section 3 — Messages: inline thread, composer at bottom with attachment support.

**`/portal/invoices`** — All client's invoices across projects. DataTable with status filter tabs (All, Unpaid, Paid). Click row → invoice detail modal showing full invoice with line items and "Pay Now" button.

**`/portal/messages`** — Two sections: General Messages (client-level chat with freelancer, proposals arrive here) and Project Chats (list of projects with recent message preview, click → project detail).

**Proposal rendering:** Proposal and counter messages render as structured cards in the chat thread. Latest active proposal shows Accept/Counter/Reject buttons. Counter opens modal pre-filled with proposal data, all fields editable. Accept auto-creates project. Previous proposals show as cards with disabled actions.

### Freelancer Dashboard

**`/dashboard`** — Overview. Stat cards (revenue this month, outstanding invoices, active projects, unread messages). "Needs Attention" section (overdue invoices, pending approval, unread messages, disputes). Active projects compact list. Recent activity feed. Revenue chart (6 months).

**`/dashboard/clients`** — DataTable. Columns: name, company, email, active projects, total revenue, outstanding amount. Search by name/company/email. "New Client" button → creation modal (name, email, company, phone, notes, metadata key-value editor). 3-dot menu: edit (modal), send message, archive, restore.

**`/dashboard/clients/:id`** — Client info card with edit button. Tabs: Projects (compact list), Invoices (compact list), Messages (client-level chat with proposals), Activity.

**`/dashboard/projects`** — DataTable with status filter tabs. Columns: name, client(s), status, milestone progress, budget, due date, unread messages. "New Project" button → creation modal (name, clients multi-select with primary, description, budget, currency, dates).

**`/dashboard/projects/:id`** — Tabbed (for freelancer).
- Header: project name (inline editable), status badge, client name(s), budget, dates, action buttons (Send for Lock-In, Submit for Approval, Pause, Resume, Archive).
- Tab 1 — Milestones & Deliverables: expandable milestone cards, drag reorder, status dropdowns, deliverable upload zones, release toggles, version history.
- Tab 2 — Messages: project-level chat thread with composer.
- Tab 3 — Invoices: linked invoices, "Create Invoice" button.
- Tab 4 — Activity: project event feed.

**`/dashboard/invoices`** — DataTable with status filter tabs. 3-dot menu: send, duplicate, cancel.

**`/dashboard/invoices/new`** — Full page form. Client selector, project selector, milestone linker, line item editor (add/remove rows, running total), total with override, notes, due date. "Save as Draft" and "Save & Send" buttons.

**`/dashboard/invoices/:id`** — Formatted invoice preview (as client sees it). Action bar based on status: edit, send, resend, settle, cancel.

**`/dashboard/analytics`** — Period selector. Revenue stats + monthly chart + by-client chart. Project stats + status distribution. Client stats + top clients table.

**`/dashboard/settings`** — Independent sections: Branding (name, colour, logo with preview), Invoicing (currency, prefix, next number, payment instructions), Portal (welcome text), Active Sessions (client sessions with revoke), Account (profile fields, password change).

### Admin Dashboard (Managed Mode)

**`/admin`** — Overview: total tenants, total MRR, transaction fees this month, total revenue, active tenants, system health.

**`/admin/tenants`** — DataTable: name, email, subdomain, tier, subscription status, signup date, last active, storage used.

**`/admin/tenants/:id`** — Tenant info, usage stats vs limits, revenue from tenant, subscription management.

### Shared Patterns

**Confirmation dialogs:** all destructive actions. "Are you sure?" with specific description. Cancel + action button.

**Toasts:** top-right, auto-dismiss 5s. Success (green), Error (red), Info (blue, SSE-driven, clickable).

**Loading states:** skeleton matching content layout. No spinners except on buttons during mutations.

**Empty states:** icon, title, description, action button. Per-list.

**Error states:** error icon, "Something went wrong", retry button.

**Unread indicators:** red dots on sidebar items (projects with pending_approval, overdue invoices), notification bell badge, per-project unread message counts on cards.

---

## 8. INTEGRATION SPECIFICS

### Stripe

**Self-hosted:** direct API keys in env vars. Optional — if unset, invoicing works without online payment. "Pay Now" hidden, `payment_instructions` text shown instead.

**Managed:** Stripe Connect Standard accounts. Platform fee via `application_fee_amount`. Stripe Billing for monthly subscriptions.

**Checkout Session creation:** on demand when client clicks "Pay Now." Fresh session every time. Previous sessions abandoned.

**Webhook handler:** signature verification, `checkout.session.completed` (update invoice, release deliverables, activity event, SSE), `checkout.session.expired` (activity event only). Always returns 200.

**Manual settlement:** freelancer opens modal — amount received, payment method dropdown (bank_transfer, platform_payment, paypal, cash, crypto, other), reference (required). Status → settled. Deliverables auto-released.

**Overdue check:** in-process task on startup + every 24 hours. Updates sent invoices past due date to overdue. Creates activity events and SSE notifications.

### File Storage

**Interface:**
```typescript
interface StorageAdapter {
  upload(key: string, stream: ReadableStream, metadata: { contentType: string; size: number }): Promise<void>
  download(key: string): Promise<{ stream: ReadableStream; contentType: string; size: number }>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

**Local adapter:** files at `STORAGE_LOCAL_PATH` (default `./data/uploads/`). Docker volume mount for persistence.

**S3 adapter:** `@aws-sdk/client-s3`. Works with Cloudflare R2 (recommended), AWS S3, MinIO. Configured via env vars: bucket, region, access key, secret key, endpoint.

**Key structure:** `deliverables/{projectId}/{milestoneId}/{deliverableId}/{filename}`, `messages/{projectId}/{messageId}/{filename}`, `brand/logo/{filename}`.

**Upload handling:** stream-based, never fully loaded into memory. Middleware validates size (100MB max) and blocks executable extensions before business logic.

### Email (Resend)

**Self-hosted:** optional. If unconfigured, manual link sharing for auth, manual portal link sharing for invoices.

**Managed:** centralised platform account. From: `portal@platformdomain.com`. Templates inject tenant branding (logo, brand name, brand colour for CTA button, subdomain URL). Footer: "Powered by {platformName}."

**Two email types:**

1. Magic link: subject "Log in to {brandName}", CTA button with login URL, 15-minute expiry note.
2. Invoice notification: subject "New invoice from {brandName}: {invoiceNumber}", invoice summary, "View & Pay" CTA.

**Failure handling:** email delivery is part of the transaction. Magic link request fails → show error, don't say "check your email." Invoice send fails → stay in draft, error toast.

---

## 9. DEPLOYMENT & CONFIGURATION

### Docker

Application Dockerfile: multi-stage build (node:20-alpine builder + runner). Next.js standalone output. Image under 200MB.

`docker-compose.yml`: app + postgres:16-alpine. Volume mounts for uploads and database data.

`docker-compose.production.yml`: extends with Caddy for automatic HTTPS via Let's Encrypt.

### Database Migrations

**Explicit, never automatic.** Run via `pnpm db:migrate`. Application refuses to start if pending migrations exist — logs clear message and exits.

For one-click deploy platforms: `pnpm db:migrate && node server.js` as the start command. Migrations run during deploy pipeline, not at runtime.

### One-Click Deploy

Configs for Railway (`railway.toml`), Render (`render.yaml`), and Fly.io (`fly.toml`). Each chains migration into the deploy command. Managed Postgres provisioned by the platform. Deployer configures env vars through platform UI.

### Environment Variables

```
# REQUIRED
DATABASE_URL          — PostgreSQL connection string
APP_URL               — Public URL (for links, CORS)
NODE_ENV              — production | development
PLATFORM_MODE         — self-hosted | managed

# PAYMENTS (optional self-hosted, required managed)
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET

# EMAIL (optional self-hosted, platform-managed in managed mode)
RESEND_API_KEY
EMAIL_FROM_ADDRESS

# STORAGE (defaults to local)
STORAGE_DRIVER        — local | s3
STORAGE_LOCAL_PATH    — default ./data/uploads
STORAGE_S3_BUCKET
STORAGE_S3_REGION
STORAGE_S3_ACCESS_KEY
STORAGE_S3_SECRET_KEY
STORAGE_S3_ENDPOINT

# APPLICATION
MAX_UPLOAD_SIZE_MB    — default 100
SESSION_COOKIE_NAME   — default pylon_session
DOMAIN                — for Caddy HTTPS
DB_PASSWORD           — for docker-compose

# MANAGED MODE ONLY
ADMIN_EMAIL           — platform admin account
ADMIN_PASSWORD        — platform admin account
```

### Security

- All cookies: HttpOnly, Secure (production), SameSite=Lax.
- CORS: restricted to APP_URL. No wildcard.
- Helmet middleware for security headers.
- Rate limiting on auth endpoints.
- No sensitive data in production error responses.
- Only STRIPE_PUBLISHABLE_KEY and APP_URL exposed to frontend.
- Drizzle parameterised queries prevent SQL injection.
- Executable file upload blocking.

### Logging

Pino. JSON in production, pretty in development. Logs: startup, API requests (method, path, status, response time, user ID), auth events, payment events, scheduled tasks, errors. Never logs: passwords, API keys, file contents, message bodies.

### Scheduled Tasks

In-process via `setInterval`. No external cron.

- Session cleanup: startup + every 60 minutes.
- Magic link token cleanup: startup + every 60 minutes.
- Overdue invoice check: startup + every 24 hours.
- Email counter reset (managed): daily, per tenant.
- Subscription status sync (managed): every 6 hours.
- Storage recalculation (managed): weekly.

### Repository Structure

Organised by domain. Everything related to a feature lives together.

```
src/
  app/                    → Next.js App Router (pages, layouts, API routes)
  components/
    ui/                   → shadcn primitives
    layout/               → shells, sidebar, nav
    data/                 → DataTable, pagination, search, empty/loading states
    feedback/             → toasts, notification centre
    project/              → project cards, milestones, deliverables, proposals
    messaging/            → thread, bubbles, composer, attachments
    invoicing/            → forms, line items, preview, settlement
    client/               → cards, forms, metadata editor
    analytics/            → charts, stat cards
    settings/             → branding, sessions, general
    common/               → file upload, confirm dialog, status badge, menus
    onboarding/           → setup wizard steps
  hooks/                  → React Query hooks per resource
  stores/                 → Zustand stores
  lib/
    auth/                 → sessions, magic links, middleware, rate limiting
    clients/              → queries, validators, actions
    projects/             → queries, validators, actions, state machine
    milestones/           → queries, validators, actions
    deliverables/         → queries, validators, actions
    messages/             → queries, validators, actions
    invoices/             → queries, validators, actions, settlement
    analytics/            → queries
    activity/             → queries, create utility
    storage/              → interface, local adapter, s3 adapter, factory
    email/                → interface, resend, noop, templates
    stripe/               → checkout, webhook, connect
    platform/             → mode detection, tier config, limit enforcement
    scheduled/            → task runner, cleanup, overdue check
    db/                   → schema, migrations, connection
    errors.ts
    constants.ts
  types/
```

API route files are thin — validate request, call action from lib/, return response. Business logic never lives in route files.

---

## 10. MULTI-TENANCY & MANAGED SAAS

### Mode Detection

`PLATFORM_MODE` env var. A platform service layer abstracts all differences. Feature code is mode-agnostic.

### Database

The schema is built once with all columns for both modes from the initial migration. The `tenants` table includes all managed-mode columns (subdomain, stripe_connected_account_id, subscription fields, usage counters) from the start — they're nullable with defaults and inert in self-hosted mode. Every other table includes `tenant_id` from the start. No table renames, no column additions, no mid-build migrations.

In managed mode, row-level security in Postgres provides a database-level safety net:

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Applied to every tenant-scoped table. Application sets `app.current_tenant_id` on each connection. Even if application code misses a WHERE clause, Postgres blocks cross-tenant access.

### Tenant Routing

Wildcard DNS on `*.platformdomain.com`. Wildcard SSL.

1. Request to `acme.platformdomain.com`.
2. Middleware extracts subdomain from Host header.
3. Looks up tenant by subdomain.
4. Not found → 404.
5. Found → sets tenant_id in request context and Postgres session variable. Loads tenant branding.

Freelancers log in at `app.platformdomain.com`, identified by email. Clients always access via tenant's subdomain.

### Stripe Connect

Standard accounts. Freelancer clicks "Connect Stripe" → OAuth flow → authorises → `stripe_connected_account_id` stored.

Payments routed through platform with `application_fee_amount`:

```typescript
const session = await stripe.checkout.sessions.create({
  // ... invoice details
  payment_intent_data: {
    application_fee_amount: calculatePlatformFee(invoice.amount, tenant.subscriptionTier)
  }
}, {
  stripeAccount: tenant.stripeConnectedAccountId
})
```

### Subscription Billing

Stripe Billing on platform's Stripe account. Subscription created on tier upgrade. Webhooks handle: invoice.paid (active), invoice.payment_failed (past_due), customer.subscription.deleted (cancelled → downgrade to starter). No data loss on downgrade.

### Tier Configuration

All values as variables in one location (`lib/platform/tier-config.ts`):

```typescript
const TIER_CONFIG = {
  starter: {
    monthlyFee: 0,
    transactionFeePercent: 6,
    maxStorageGB: 5,
    maxEmailsPerMonth: 500,
    maxClients: 20,
    maxProjects: 50
  },
  pro: {
    monthlyFee: 2900,
    transactionFeePercent: 3,
    maxStorageGB: 25,
    maxEmailsPerMonth: 5000,
    maxClients: 100,
    maxProjects: 500
  },
  agency: {
    monthlyFee: 9900,
    transactionFeePercent: 0.5,
    maxStorageGB: 100,
    maxEmailsPerMonth: 25000,
    maxClients: null,
    maxProjects: null
  }
}
```

All numbers are configurable placeholders. Limit enforcement: middleware checks tenant usage against tier config. Exceeded → 403 with clear upgrade message.

### Email in Managed Mode

Centralised Resend. From: `portal@platformdomain.com`. Templates inject tenant branding: logo, brand name, brand colour for accents, subdomain URL for links. Footer: "Powered by {platformName}."

### Admin Dashboard

Third role: `admin`. Account created via ADMIN_EMAIL/ADMIN_PASSWORD env vars on first platform boot.

Overview: total tenants (trend), MRR, transaction fees (monthly), total revenue, active tenants, system health.

Tenant list: searchable, filterable by tier and status.

Tenant detail: info, usage stats vs limits, revenue from tenant, subscription management, suspend action.

Revenue: MRR by tier, fees by month chart, total revenue chart, churn.

### Self-Hosted vs Managed Summary

| Concern | Self-Hosted | Managed |
|---|---|---|
| Tenancy | Single tenant row, tenant_id present but single-valued | Multi-tenant, tenant_id actively scoped + RLS |
| Stripe | Direct API keys | Stripe Connect + platform fee |
| Email | Own Resend or manual | Centralised platform Resend |
| Storage | Local or own S3/R2 | Platform R2, usage tracked |
| Auth entry | Setup wizard | Signup + subdomain selection |
| Routing | Single instance | Subdomain-based tenant resolution |
| Billing | None | Stripe Billing subscriptions |
| Admin | None | Admin role + dashboard |
| Limits | None | Tier-based enforcement |
| Updates | Manual pull/redeploy | Platform operator deploys once |

---

## 11. TESTING STRATEGY

### API Tests (Vitest + Supertest)

Every API endpoint tested. Test database setup/teardown per suite. Coverage:

- Successful operations for every endpoint.
- Validation errors (missing fields, invalid types, constraint violations).
- Auth rejection (no session, expired session).
- Role-based access (client vs freelancer on every route).
- Client data scoping (client A cannot access client B's data).
- State machine enforcement (invalid project transitions).
- Pagination, sorting, search.
- File upload/download with size and type validation.
- Edge cases: soft-deleted resources, rate limiting, concurrent operations.

### E2E Tests (Playwright)

Critical user flows in headless Chromium:

- Freelancer: setup → create client → create project → add milestones → upload deliverable → send invoice → settle.
- Client: magic link login → view project → view milestones → download released deliverable → pay invoice → approve milestone.
- Proposal: freelancer sends proposal → client counters → freelancer accepts → project auto-created.
- Completion: freelancer submits → client disputes → freelancer resubmits → client accepts.
- Auth: login, logout, session expiry, rate limiting.

### Platform Tests (Managed Mode)

- Tenant isolation: tenant A cannot access tenant B's data via API or direct query.
- RLS enforcement.
- Subdomain routing.
- Stripe Connect payment flow with platform fee.
- Subscription lifecycle (upgrade, downgrade, cancellation).
- Tier limit enforcement.
- Email counter reset.
- Admin access control.