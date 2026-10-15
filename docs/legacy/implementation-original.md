# Cortex Implementation Plan — Step-by-Step Directive

**Reference Document:** vision-architecture.md (the source of truth)
**Execution Model:** Each step is a discrete, self-contained task. Steps are strictly sequential — do not begin a step until the previous step's acceptance criteria are met. Every step builds on a verified foundation.
**Product:** Unnamed Client Portal (do not hardcode any product name — use the `brand_name` from settings throughout)
**Creator:** Abyss Global

---

## How To Read This Document

Each step follows the same structure:

- **What:** exactly what is being built
- **Files:** every file created or modified
- **Detail:** precise implementation specification
- **Tests:** what tests to write for this step (where applicable)
- **Acceptance:** how to verify the step is complete before moving on

Do not deviate from the specification. Do not add features, utilities, or abstractions not described. Do not skip acceptance criteria. If a step says "create file X with function Y," create exactly that. The vision-architecture.md document is the canonical reference for all data shapes, API contracts, and business rules.

---

## PHASE A — FOUNDATION

These steps establish the infrastructure that every feature depends on. No feature code exists yet. After this phase, the application boots, connects to the database, and has all cross-cutting utilities in place.

---

### Step 1 — Project Scaffold

**What:** Initialise the project with all tooling configured and the complete directory structure in place.

**Files:**

```
package.json
pnpm-lock.yaml
tsconfig.json
next.config.ts
tailwind.config.ts
biome.json
.env.example
.gitignore
Dockerfile
docker-compose.yml
docker-compose.production.yml
Caddyfile
README.md
LICENSE

src/
  app/
    layout.tsx              (root layout — html, body, font setup)
    (landing)/
      layout.tsx            (placeholder)
      page.tsx              (placeholder)
    (auth)/
      layout.tsx            (placeholder)
      login/page.tsx        (placeholder)
      setup/page.tsx        (placeholder)
    (portal)/
      layout.tsx            (placeholder)
      login/page.tsx        (placeholder)
      projects/
        page.tsx            (placeholder)
        [id]/page.tsx       (placeholder)
      invoices/
        page.tsx            (placeholder)
        [id]/page.tsx       (placeholder)
      messages/page.tsx     (placeholder)
    (dashboard)/
      layout.tsx            (placeholder)
      page.tsx              (placeholder)
      clients/
        page.tsx            (placeholder)
        [id]/page.tsx       (placeholder)
      projects/
        page.tsx            (placeholder)
        [id]/
          page.tsx          (placeholder)
          messages/page.tsx (placeholder)
      invoices/
        page.tsx            (placeholder)
        [id]/page.tsx       (placeholder)
        new/page.tsx        (placeholder)
      analytics/page.tsx    (placeholder)
      settings/page.tsx     (placeholder)
    (admin)/
      layout.tsx            (placeholder)
      page.tsx              (placeholder)
      tenants/
        page.tsx            (placeholder)
        [id]/page.tsx       (placeholder)
    api/
      health/route.ts       (health check — returns { status: 'healthy' })
  components/
    ui/                     (empty — shadcn primitives added here later)
  hooks/                    (empty)
  stores/                   (empty)
  lib/
    db/                     (empty)
    auth/                   (empty)
    clients/                (empty)
    projects/               (empty)
    milestones/             (empty)
    deliverables/           (empty)
    messages/               (empty)
    invoices/               (empty)
    analytics/              (empty)
    activity/               (empty)
    storage/                (empty)
    email/                  (empty)
    stripe/                 (empty)
    platform/               (empty)
    scheduled/              (empty)
  types/                    (empty)
```

**Detail:**

- `package.json`: all dependencies from the tech stack section of vision-architecture.md. Runtime: `next`, `react`, `react-dom`, `typescript`, `drizzle-orm`, `postgres`, `zod`, `bcrypt`, `stripe`, `resend`, `@aws-sdk/client-s3`, `mime-types`, `pino`, `helmet`, `@tanstack/react-query`, `zustand`, `lucide-react`. Dev: `drizzle-kit`, `vitest`, `supertest`, `playwright`, `@biomejs/biome`, `pino-pretty`, `tailwindcss`, `@tailwindcss/typography`. Scripts: `dev`, `build`, `start`, `lint`, `test`, `test:e2e`, `db:generate`, `db:migrate`.
- `next.config.ts`: `output: 'standalone'`, `serverExternalPackages: ['bcrypt']`.
- `tailwind.config.ts`: content paths, `darkMode: 'class'`, semantic colour tokens for light/dark themes (surface, primary, secondary, destructive, muted, accent, border, input, ring, background, foreground and their dark variants).
- `biome.json`: default formatter and linter config.
- `.env.example`: every environment variable from vision-architecture.md Section 9, with comments and defaults.
- `Dockerfile`: multi-stage build exactly as specified in vision-architecture.md.
- `docker-compose.yml`: app + postgres:16-alpine exactly as specified.
- `docker-compose.production.yml`: extends with Caddy exactly as specified.
- `Caddyfile`: `{$DOMAIN} { reverse_proxy app:3000 }`.
- `LICENSE`: MIT.
- `README.md`: skeleton with product name placeholder, sections for Quick Start, Features, Configuration, Deploy, Build Report, Built by Abyss Global, License.
- All placeholder pages: render a simple div with the route path as text (e.g. `<div>Dashboard Overview</div>`). These get replaced in later steps.
- Health check route: return `{ status: 'healthy', version: '0.1.0' }`.

**Acceptance:**

- `pnpm install` completes without errors.
- `pnpm dev` starts the Next.js dev server.
- `pnpm build` produces standalone output in `.next/standalone/`.
- `pnpm lint` (Biome) passes with no errors.
- `docker build .` succeeds and produces an image under 200MB.
- Visiting `/` in the browser shows the landing page placeholder.
- Visiting `/api/health` returns the JSON health response.
- All placeholder routes resolve without 404.

---

### Step 2 — Database Schema & Migrations

**What:** Define the complete Drizzle schema and generate the initial migration. Every table, column, constraint, index, and default as specified in vision-architecture.md Section 3.

**Files:**

```
src/lib/db/schema.ts        (complete Drizzle schema)
src/lib/db/index.ts          (database connection)
drizzle/drizzle.config.ts    (Drizzle Kit config)
drizzle/migrations/          (generated migration files)
```

**Detail:**

`src/lib/db/schema.ts`:

Define every table from vision-architecture.md Section 3 using Drizzle's `pgTable`:

- `tenants` — all columns including managed-mode columns (subdomain, stripe_connected_account_id, subscription_tier, subscription_stripe_id, subscription_status, storage_used_bytes, emails_sent_this_month, emails_reset_at). Managed-mode columns are nullable or have defaults. Table is always called `tenants`.
- `clients` — with `tenant_id` FK, soft delete (`deleted_at`), `metadata` jsonb.
- `projects` — with `tenant_id` FK, `proposal_message_id` FK, soft delete, status as varchar with default `'draft'`.
- `project_clients` — composite PK on (project_id, client_id), role varchar with default `'member'`.
- `milestones` — with `tenant_id` FK, position integer.
- `deliverables` — with `tenant_id` FK, `parent_deliverable_id` self-reference, `released` boolean default false.
- `messages` — with `tenant_id` FK, nullable `project_id`, `client_id` NOT NULL, `type` varchar default `'message'`, `proposal_data` jsonb nullable, `proposal_id` self-reference nullable.
- `message_attachments` — with `tenant_id` FK.
- `invoices` — with `tenant_id` FK, `settlement_data` jsonb nullable, soft delete.
- `invoice_line_items` — with `tenant_id` FK, ON DELETE CASCADE from invoices.
- `invoice_milestones` — composite PK, with `tenant_id` FK.
- `sessions` — with `tenant_id` FK.
- `magic_link_tokens` — with `tenant_id` FK.
- `activity_events` — with `tenant_id` FK.
- `settings` — with `tenant_id` FK.
- `platform_settings` — no tenant_id. Single row for platform config.
- `platform_events` — no tenant_id on itself, but has a `tenant_id` nullable FK for association.

Every index specified in vision-architecture.md must be created. Every FK constraint must be defined. Every default must be set.

Export all table definitions and inferred types (`typeof tenants.$inferSelect`, `typeof tenants.$inferInsert` etc.) for use in the rest of the codebase.

`src/lib/db/index.ts`:

Database connection using the `postgres` driver and Drizzle. Reads `DATABASE_URL` from environment. Exports the `db` instance.

`drizzle/drizzle.config.ts`:

Drizzle Kit configuration pointing to the schema file, migration output directory, and database connection.

After defining the schema, run `pnpm db:generate` to produce the initial migration. This migration creates ALL tables in one go.

**Startup migration check:** In `src/lib/db/index.ts`, export a `checkMigrations()` function that verifies no pending migrations exist. This function is called on application startup (wired in a later step). If pending migrations exist, it throws an error with message: "Database has pending migrations. Run `pnpm db:migrate` before starting the server."

**Tests:**

- Schema file exports all table definitions.
- `pnpm db:generate` produces a migration file.
- `pnpm db:migrate` against a fresh Postgres instance creates all tables.
- Querying each table returns empty results (tables exist with correct columns).

**Acceptance:**

- `pnpm db:generate` produces migration files with no errors.
- `pnpm db:migrate` against a fresh Postgres creates all tables with correct columns, types, constraints, indexes.
- Every FK relationship is enforced (inserting a row with a non-existent FK fails).
- Every default value is applied (inserting a row without optional fields populates defaults).
- The schema file exports types for every table.

---

### Step 3 — Core Infrastructure

**What:** Error handling, response envelope utilities, Zod validation middleware, logging, security headers, and constants. These are used by every API route.

**Files:**

```
src/lib/errors.ts            (typed error classes)
src/lib/constants.ts         (enums, status values, event types)
src/lib/api-utils.ts         (response envelope helpers, validation wrapper)
src/lib/logger.ts            (Pino logger)
src/lib/middleware.ts         (Helmet setup, CORS)
src/types/index.ts           (shared TypeScript types)
```

**Detail:**

`src/lib/errors.ts`:

Define error classes that extend a base `AppError`:

```typescript
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) { super(message) }
}

class ValidationError extends AppError { constructor(message, details?) { super(400, 'VALIDATION_ERROR', message, details) } }
class UnauthorizedError extends AppError { constructor(message?) { super(401, 'UNAUTHORIZED', message || 'Authentication required') } }
class PaymentRequiredError extends AppError { constructor(message?) { super(402, 'PAYMENT_REQUIRED', message || 'Payment required') } }
class ForbiddenError extends AppError { constructor(message?) { super(403, 'FORBIDDEN', message || 'Insufficient permissions') } }
class NotFoundError extends AppError { constructor(message?) { super(404, 'NOT_FOUND', message || 'Resource not found') } }
class ConflictError extends AppError { constructor(message?) { super(409, 'CONFLICT', message || 'State conflict') } }
class RateLimitedError extends AppError { constructor(retryAfter: number) { super(429, 'RATE_LIMITED', `Too many attempts. Try again in ${retryAfter} minutes.`) } }
class InternalError extends AppError { constructor(message?) { super(500, 'INTERNAL_ERROR', message || 'Internal server error') } }
```

`src/lib/constants.ts`:

All enums and constant values:

- `PROJECT_STATUS`: `draft`, `pending_lockin`, `active`, `paused`, `pending_approval`, `completed`, `archived`.
- `PROJECT_TRANSITIONS`: map of valid `from → to[]` transitions exactly as specified in vision-architecture.md.
- `MILESTONE_STATUS`: `pending`, `in_progress`, `review`, `approved`.
- `INVOICE_STATUS`: `draft`, `sent`, `paid`, `settled`, `overdue`, `cancelled`.
- `MESSAGE_TYPE`: `message`, `proposal`, `counter`, `accept`, `reject`.
- `USER_TYPE`: `freelancer`, `client`, `admin`.
- `PROJECT_CLIENT_ROLE`: `primary`, `member`.
- `SETTLEMENT_METHODS`: `bank_transfer`, `platform_payment`, `paypal`, `cash`, `crypto`, `other`.
- `EVENT_TYPES`: all activity event type strings (e.g. `client.created`, `project.created`, `project.locked_in`, `project.submitted_for_approval`, `project.accepted`, `project.disputed`, `milestone.created`, `milestone.approved`, `deliverable.uploaded`, `deliverable.downloaded`, `deliverable.released`, `invoice.created`, `invoice.sent`, `invoice.paid`, `invoice.settled`, `invoice.overdue`, `invoice.cancelled`, `message.sent`, `session.revoked`, `settings.updated`).
- `BLOCKED_EXTENSIONS`: `['.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.dll', '.com']`.
- `DEFAULT_PAGE_LIMIT`: 20, `MAX_PAGE_LIMIT`: 100, `DEFAULT_MESSAGE_LIMIT`: 50.
- `SESSION_DURATION_FREELANCER_DAYS`: 90, `SESSION_DURATION_CLIENT_DAYS`: 90.
- `MAGIC_LINK_EXPIRY_EMAIL_MINUTES`: 15, `MAGIC_LINK_EXPIRY_MANUAL_HOURS`: 24.
- `RATE_LIMIT_LOGIN`: `{ maxAttempts: 5, windowMinutes: 15 }`.
- `RATE_LIMIT_MAGIC_LINK_EMAIL`: `{ maxAttempts: 3, windowMinutes: 15 }`.
- `RATE_LIMIT_MAGIC_LINK_IP`: `{ maxAttempts: 10, windowMinutes: 15 }`.

`src/lib/api-utils.ts`:

Response helpers enforcing the envelope from vision-architecture.md Section 5:

```typescript
function success(data: unknown, status = 200)
function paginated(data: unknown[], meta: { page: number, limit: number, total: number })
function error(err: AppError)
function handleApiError(err: unknown) // catches AppError and unknown errors, returns appropriate envelope
```

Validation wrapper:

```typescript
function validateBody<T>(schema: ZodSchema<T>, body: unknown): T
// Throws ValidationError with field-level details on failure
```

Pagination parser:

```typescript
function parsePagination(searchParams: URLSearchParams): { page: number, limit: number, offset: number }
// Reads page and limit from params, enforces defaults and max
```

Sort parser:

```typescript
function parseSort(searchParams: URLSearchParams, validFields: string[], defaultField: string, defaultOrder: 'asc' | 'desc'): { sort: string, order: 'asc' | 'desc' }
```

`src/lib/logger.ts`:

Pino instance. JSON in production, pretty in development. Export the logger.

`src/lib/middleware.ts`:

Helmet configuration for Next.js middleware or API route wrapper. Sets: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000`, `X-XSS-Protection: 1; mode=block`.

`src/types/index.ts`:

Shared types:

```typescript
type AuthContext = { userId: string, userType: 'freelancer' | 'client' | 'admin', email: string, name: string, tenantId: string }
type ApiResponse<T> = { data: T, meta: PaginationMeta | null, error: null }
type ApiError = { data: null, meta: null, error: { code: string, message: string, details?: Record<string, unknown> } }
type PaginationMeta = { page: number, limit: number, total: number }
```

**Tests (Vitest):**

- Each error class produces correct statusCode, code, and message.
- `success()` returns correct envelope shape.
- `paginated()` includes meta.
- `handleApiError()` catches AppError and returns correct status; catches unknown errors and returns 500.
- `validateBody()` returns parsed data on valid input; throws ValidationError with field details on invalid input.
- `parsePagination()` returns correct defaults, respects max limit, handles missing params.
- `parseSort()` returns default when no params, validates against allowed fields, ignores invalid fields.
- `PROJECT_TRANSITIONS` correctly maps every valid transition and excludes invalid ones.

**Acceptance:**

- All error classes instantiate correctly and produce the right HTTP status codes.
- Response helpers produce the exact envelope shape from the spec.
- Validation wrapper correctly validates and rejects Zod schemas.
- Logger outputs structured JSON.
- All tests pass.

---

### Step 4 — Storage Interface

**What:** File storage abstraction with local filesystem and S3/R2 adapters. File upload middleware for size and type validation.

**Files:**

```
src/lib/storage/interface.ts    (StorageAdapter interface)
src/lib/storage/local.ts        (LocalStorageAdapter)
src/lib/storage/s3.ts           (S3StorageAdapter)
src/lib/storage/index.ts        (factory — selects adapter based on env var)
src/lib/storage/upload.ts       (file upload validation middleware)
```

**Detail:**

`interface.ts`:

```typescript
interface StorageAdapter {
  upload(key: string, stream: ReadableStream | Buffer, metadata: { contentType: string; size: number }): Promise<void>
  download(key: string): Promise<{ stream: ReadableStream; contentType: string; size: number }>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

`local.ts`: implements StorageAdapter. Reads `STORAGE_LOCAL_PATH` (default `./data/uploads/`). Creates directories recursively on upload. Uses `fs` streams for upload/download. Uses `mime-types` package for content type lookup on download.

`s3.ts`: implements StorageAdapter. Uses `@aws-sdk/client-s3` with `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`, `HeadObjectCommand`. Reads `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, `STORAGE_S3_ACCESS_KEY`, `STORAGE_S3_SECRET_KEY`, `STORAGE_S3_ENDPOINT` from env.

`index.ts`: factory function `getStorage()` that reads `STORAGE_DRIVER` env var. Returns `LocalStorageAdapter` for `'local'` (default), `S3StorageAdapter` for `'s3'`. Singleton — creates adapter once, returns same instance on subsequent calls.

`upload.ts`: utility function `validateUpload(file: File)` that checks:
- File size against `MAX_UPLOAD_SIZE_MB` env var (default 100). Throws `ValidationError` if exceeded.
- File extension against `BLOCKED_EXTENSIONS` constant. Checks both filename extension and MIME type. Throws `ValidationError` if blocked.

Returns `{ filename: string, buffer: Buffer, contentType: string, size: number }`.

**Tests (Vitest):**

- LocalStorageAdapter: upload creates file on disk, download returns correct stream and metadata, delete removes file, exists returns correct boolean.
- Upload validation: rejects files over size limit, rejects blocked extensions (.exe, .bat etc.), accepts normal files.
- Storage factory returns LocalStorageAdapter by default, returns S3StorageAdapter when env is set.

**Acceptance:**

- Can upload a file to local storage, read it back, verify contents match.
- Can delete a file and confirm it no longer exists.
- Blocked file types are rejected with clear error.
- Oversized files are rejected with clear error.
- All tests pass.

---

### Step 5 — Email Interface

**What:** Email delivery abstraction with Resend implementation and no-op fallback. HTML email templates for magic links and invoice notifications.

**Files:**

```
src/lib/email/interface.ts      (EmailService interface)
src/lib/email/resend.ts         (ResendEmailService)
src/lib/email/noop.ts           (NoopEmailService)
src/lib/email/templates.ts      (HTML email templates)
src/lib/email/index.ts          (factory — selects service based on env var)
```

**Detail:**

`interface.ts`:

```typescript
interface EmailService {
  sendMagicLink(params: { to: string, clientName: string, loginUrl: string, brandName: string, brandColour: string, logoUrl: string | null }): Promise<{ success: boolean; error?: string }>
  sendInvoiceNotification(params: { to: string, clientName: string, freelancerName: string, invoiceNumber: string, amount: number, currency: string, dueDate: string | null, portalUrl: string, brandName: string, brandColour: string, logoUrl: string | null }): Promise<{ success: boolean; error?: string }>
}
```

`resend.ts`: implements EmailService using the `resend` package. Reads `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` from env. Calls `resend.emails.send()` with rendered HTML from templates. Wraps in try/catch, returns `{ success: false, error: message }` on failure.

`noop.ts`: implements EmailService. Both methods log a warning via Pino ("Email not configured — {method} called for {to}") and return `{ success: false, error: 'Email not configured' }`.

`templates.ts`: two functions that return HTML strings:

- `renderMagicLinkEmail(params)`: max-width 600px container, brand logo (if set, max-height 48px), brand name, greeting ("Hi {clientName},"), body text, large CTA button with brand colour background, expiry note, footer with brand name.
- `renderInvoiceNotificationEmail(params)`: same container and branding, greeting, invoice summary (number, amount formatted with currency, due date), "View & Pay" CTA button, footer text about messaging the freelancer, brand footer.

Both templates are clean HTML with inline CSS (email-safe). Brand colour used for CTA button background. All content parameterised — no hardcoded product names.

`index.ts`: factory function `getEmailService()`. If `RESEND_API_KEY` is set, returns `ResendEmailService`. Otherwise, returns `NoopEmailService`. Singleton.

**Tests (Vitest):**

- `NoopEmailService` returns `{ success: false }` for both methods.
- `renderMagicLinkEmail` returns valid HTML containing the login URL, client name, and brand name.
- `renderInvoiceNotificationEmail` returns valid HTML containing the invoice number, amount, and portal URL.
- Email factory returns NoopEmailService when no API key, ResendEmailService when key is present (mock the Resend constructor).

**Acceptance:**

- Templates render clean HTML with all variables injected correctly.
- NoopEmailService functions without errors.
- Factory correctly selects based on env var.
- All tests pass.

---

### Step 6 — Auth System

**What:** Complete authentication and authorization system. Session management, magic link generation and verification, password hashing, rate limiting, auth middleware, authorization middleware.

**Files:**

```
src/lib/auth/password.ts        (bcrypt hash and compare)
src/lib/auth/session.ts         (session CRUD)
src/lib/auth/magic-link.ts      (magic link token CRUD)
src/lib/auth/rate-limit.ts      (in-memory rate limiter)
src/lib/auth/middleware.ts       (auth + authorization middleware)
```

**Detail:**

`password.ts`:
- `hashPassword(password: string): Promise<string>` — bcrypt hash with cost factor 12.
- `comparePassword(password: string, hash: string): Promise<boolean>` — bcrypt compare.

`session.ts`:
- `createSession(userId: string, userType: string, tenantId: string): Promise<{ token: string, expiresAt: Date }>` — generates token via `crypto.randomBytes(32).toString('hex')`, inserts into sessions table, returns token and expiry. Freelancer expiry: 90 days. Client expiry: 90 days.
- `validateSession(token: string): Promise<AuthContext | null>` — looks up session by token, checks not expired, joins to tenants/clients table to get name and email. Returns AuthContext or null. For freelancer sessions: extends `expires_at` by 90 days (sliding window).
- `destroySession(token: string): Promise<void>` — deletes session row.
- `destroyAllSessionsForUser(userId: string, userType: string): Promise<void>` — deletes all sessions matching user.
- `destroyAllClientSessions(clientId: string): Promise<void>` — deletes all sessions where user_type = 'client' and user_id = clientId.
- `getActiveClientSessions(tenantId: string): Promise<Session[]>` — returns all active client sessions for a tenant with client name and email joined.
- `cleanExpiredSessions(): Promise<number>` — deletes all sessions where expires_at < now(). Returns count deleted.

`magic-link.ts`:
- `generateMagicLink(clientId: string, tenantId: string, isManual: boolean): Promise<string>` — generates token, stores in magic_link_tokens with appropriate expiry (15 min for email-requested, 24 hours for manual). Returns the full URL: `{APP_URL}/auth/verify?token={token}`.
- `verifyMagicLink(token: string): Promise<{ clientId: string, tenantId: string } | null>` — looks up token, validates not used and not expired. If valid: sets `used_at = now()`, returns client and tenant IDs. If invalid: returns null.
- `cleanExpiredTokens(): Promise<number>` — deletes all magic_link_tokens where expires_at < now(). Returns count.

`rate-limit.ts`:
- In-memory Map-based rate limiter.
- `checkRateLimit(key: string, config: { maxAttempts: number, windowMinutes: number }): { allowed: boolean, retryAfterMinutes: number }`.
- Tracks attempts per key with timestamps. Removes entries outside the window on each check.
- Keys are typically IP addresses or `email:ip` combinations.

`middleware.ts`:

Two functions that wrap Next.js API route handlers:

`withAuth(handler, options?)`:
1. Reads `pylon_session` cookie from request.
2. Calls `validateSession(token)`.
3. If invalid: returns 401 `UNAUTHORIZED` response.
4. Attaches `AuthContext` to the request (via a custom header or request extension pattern suitable for Next.js App Router).
5. Calls the handler.

`withAuthorization(handler, config: { allowedRoles: UserType[], clientScoping?: boolean })`:
1. Checks `authContext.userType` against `allowedRoles`. If not allowed: returns 403 `FORBIDDEN`.
2. If `clientScoping` is true and user is a client: injects the client scoping constraint (the client's user ID) into the request context for downstream queries to use.
3. Calls the handler.

Helper: `getAuthContext(request): AuthContext` — extracts the auth context from the request. Throws `UnauthorizedError` if not present.

Helper: `getTenantId(request): string` — extracts tenant ID from auth context. Every database query in the application uses this to scope by tenant.

**Tests (Vitest):**

- `hashPassword` produces a hash, `comparePassword` returns true for correct password, false for wrong.
- `createSession` inserts a row and returns a token. `validateSession` with that token returns correct AuthContext. `validateSession` with expired token returns null. `destroySession` removes it.
- Freelancer session sliding: `validateSession` updates expires_at.
- `generateMagicLink` creates a token row. `verifyMagicLink` with valid token returns client info and marks as used. Second call with same token returns null. Expired token returns null.
- Rate limiter: allows up to maxAttempts, then blocks. Allows again after window expires.
- `cleanExpiredSessions` removes only expired rows.
- `cleanExpiredTokens` removes only expired rows.

**Acceptance:**

- Complete auth flow: create session → validate → get context → destroy.
- Complete magic link flow: generate → verify (succeeds) → verify again (fails, single-use).
- Rate limiter correctly blocks after threshold.
- All tests pass.

---

### Step 7 — SSE Infrastructure

**What:** Server-Sent Events endpoint and client-side hook. The real-time event delivery system that every feature will push events through.

**Files:**

```
src/app/api/events/stream/route.ts    (SSE endpoint)
src/lib/sse/index.ts                   (connection manager + pushEvent utility)
src/hooks/useEventStream.ts            (client-side EventSource hook)
```

**Detail:**

`src/lib/sse/index.ts`:

- In-memory connection manager: `Map<string, Set<ReadableStreamController>>` keyed by userId.
- `addConnection(userId: string, controller: ReadableStreamController): void` — adds to the map.
- `removeConnection(userId: string, controller: ReadableStreamController): void` — removes from map, cleans up empty sets.
- `pushEvent(userId: string, event: { type: string, data: object }): void` — serialises event as SSE format (`event: {type}\ndata: {json}\n\n`), writes to all controllers for that userId. Catches write errors and removes dead connections.
- `pushEventToTenant(tenantId: string, event: { type: string, data: object }, excludeUserId?: string): void` — pushes to all connected users of a tenant. Used for events that should reach both freelancer and clients. Requires a lookup of connected user IDs by tenant (maintain a secondary `Map<tenantId, Set<userId>>`).
- `broadcastToProjectClients(projectId: string, event: object): void` — looks up project_clients, pushes to all connected clients on that project.

`src/app/api/events/stream/route.ts`:

GET handler:
1. Validate session from cookie (reuse auth logic).
2. Create a `ReadableStream` with a controller.
3. Register the connection via `addConnection(userId, controller)`.
4. Start heartbeat: write `: heartbeat\n\n` every 30 seconds via `setInterval`.
5. On close (abort signal): clear heartbeat interval, call `removeConnection`.
6. Return `new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } })`.

Event scoping (enforced in `pushEvent`):
- Freelancer: receives all events for their tenant.
- Client: receives only events for projects they're a member of (check `project_clients` table).

`src/hooks/useEventStream.ts`:

React hook:
1. On mount: create `EventSource` to `/api/events/stream`.
2. On message: parse event data, add to notification store (Zustand), trigger React Query cache invalidation based on event type.
3. Event-to-invalidation mapping:
   - `message.new` → invalidate `useMessages(projectId)`
   - `milestone.approved` → invalidate `useMilestones(projectId)`, `useProject(projectId)`
   - `invoice.paid` → invalidate `useInvoice(id)`, `useDeliverables(projectId)`, analytics queries
   - `invoice.sent` → invalidate `useInvoices`
   - `deliverable.uploaded` → invalidate `useDeliverables(projectId)`
   - `deliverable.released` → invalidate `useDeliverables(projectId)`
   - `project.submitted_for_approval` → invalidate `useProject(projectId)`, `useProjects`
   - `project.accepted` → invalidate `useProject(projectId)`, `useProjects`
   - `project.disputed` → invalidate `useProject(projectId)`, `useProjects`, `useMessages(projectId)`
4. On error: EventSource auto-reconnects. On reconnect: refetch all active queries.
5. On unmount: close EventSource.

**Tests (Vitest):**

- `addConnection` and `removeConnection` manage the connection map correctly.
- `pushEvent` serialises event in SSE format.
- `pushEvent` to a non-existent user is a no-op (no error).
- Connection cleanup removes dead connections.

**Acceptance:**

- Can open an SSE connection via `/api/events/stream` with a valid session cookie.
- Server sends heartbeat comments every 30 seconds.
- `pushEvent(userId, event)` delivers the event to the connected client.
- Connection is cleaned up when the client disconnects.
- All tests pass.

---

### Step 8 — Activity Events

**What:** Activity event creation utility and query endpoint. Used by every feature to record audit trail events.

**Files:**

```
src/lib/activity/create.ts       (createActivityEvent utility)
src/lib/activity/queries.ts      (query activity events)
src/app/api/activity/route.ts    (GET endpoint)
```

**Detail:**

`create.ts`:

```typescript
async function createActivityEvent(params: {
  tenantId: string
  projectId?: string | null
  actorType: 'freelancer' | 'client' | 'system'
  actorId?: string | null
  eventType: string
  metadata?: Record<string, unknown>
}): Promise<void>
```

Inserts a row into `activity_events`. Does not throw — logs errors via Pino but never fails a parent operation. Fire-and-forget.

`queries.ts`:

```typescript
async function getActivityEvents(params: {
  tenantId: string
  projectId?: string
  eventType?: string
  since?: Date
  page: number
  limit: number
}): Promise<{ events: ActivityEvent[], total: number }>
```

Queries `activity_events` with filters. Joins to `projects` for project name. Joins to `tenants` and `clients` for actor name. Returns paginated results.

For client access: the query must filter to only events on projects the client is a member of (via `project_clients` join).

`route.ts`:

GET handler. Auth required. Reads query params: `project_id`, `event_type`, `since`, `page`, `limit`. Freelancer sees all tenant events. Client sees only events on their projects. Returns paginated envelope.

**Tests (Vitest + Supertest):**

- `createActivityEvent` inserts a row with correct fields.
- `createActivityEvent` does not throw on database error (logs instead).
- GET `/api/activity` returns paginated events.
- GET with `project_id` filter returns only that project's events.
- Client can only see events on their own projects.

**Acceptance:**

- Can create an activity event and retrieve it via the API.
- Pagination works correctly.
- Filtering by project and event type works.
- Client scoping is enforced.
- All tests pass.

---

### Step 9 — Scheduled Tasks

**What:** In-process task runner for session cleanup, magic link cleanup, and overdue invoice checking.

**Files:**

```
src/lib/scheduled/index.ts              (task runner)
src/lib/scheduled/cleanup-sessions.ts   (session cleanup)
src/lib/scheduled/cleanup-tokens.ts     (magic link token cleanup)
src/lib/scheduled/check-overdue.ts      (overdue invoice check)
```

**Detail:**

`index.ts`:

```typescript
function startScheduledTasks(): void {
  // Run immediately
  cleanExpiredSessions()
  cleanExpiredTokens()
  checkOverdueInvoices()

  // Schedule recurring
  setInterval(cleanExpiredSessions, 60 * 60 * 1000)          // every hour
  setInterval(cleanExpiredTokens, 60 * 60 * 1000)            // every hour
  setInterval(checkOverdueInvoices, 24 * 60 * 60 * 1000)     // every 24 hours
}
```

Each task function is imported from its own file. The runner is called once during application startup.

`cleanup-sessions.ts`: calls `cleanExpiredSessions()` from auth/session.ts. Logs: "Cleaned {n} expired sessions."

`cleanup-tokens.ts`: calls `cleanExpiredTokens()` from auth/magic-link.ts. Logs: "Cleaned {n} expired magic link tokens."

`check-overdue.ts`:

```typescript
async function checkOverdueInvoices(): Promise<void> {
  const overdueInvoices = await db
    .update(invoices)
    .set({ status: 'overdue', updatedAt: new Date() })
    .where(and(eq(invoices.status, 'sent'), lt(invoices.dueDate, new Date())))
    .returning()

  for (const invoice of overdueInvoices) {
    await createActivityEvent({
      tenantId: invoice.tenantId,
      projectId: invoice.projectId,
      actorType: 'system',
      eventType: 'invoice.overdue',
      metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount }
    })
    // Push SSE event to freelancer
  }
  logger.info(`Marked ${overdueInvoices.length} invoices as overdue`)
}
```

**Tests (Vitest):**

- Session cleanup removes expired sessions, leaves active ones.
- Token cleanup removes expired tokens, leaves valid ones.
- Overdue check updates `sent` invoices past due date to `overdue`, creates activity events. Does not touch `draft`, `paid`, `settled`, `cancelled` invoices.

**Acceptance:**

- `startScheduledTasks()` runs all three tasks immediately without errors.
- Each task correctly identifies and processes its target rows.
- Logging output confirms task execution.
- All tests pass.

---

## PHASE B — FEATURES

Each step in this phase delivers a complete feature: API routes, frontend UI, tests, activity events, and SSE triggers. Each step is self-contained — after completion, that feature works end-to-end in the browser.

---

### Step 10 — Setup & Onboarding

**What:** First-boot setup wizard for self-hosted mode. The entry point for new deployments. API endpoint for account creation plus the four-step onboarding UI.

**Files:**

```
src/app/api/setup/route.ts
src/app/api/setup/verify-stripe/route.ts
src/app/api/setup/verify-email/route.ts
src/app/api/setup/verify-storage/route.ts
src/app/(auth)/setup/page.tsx
src/components/onboarding/SetupWizard.tsx
src/components/onboarding/AccountStep.tsx
src/components/onboarding/IntegrationsStep.tsx
src/components/onboarding/BrandingStep.tsx
src/components/onboarding/CompleteStep.tsx
src/lib/setup/validators.ts
```

**Detail:**

`POST /api/setup`:
- Checks if any tenant row exists. If yes → 409 CONFLICT "Setup already completed."
- Validates body with Zod: name (required), email (required, valid email), password (required, min 8 chars), company (optional), defaultCurrency (optional, 3-char, default GBP), brandName (optional, default 'Portal').
- Hashes password. Creates tenant row. Creates settings row with defaults and any overrides. Creates session. Sets cookie. Returns user object.

`POST /api/setup/verify-stripe`:
- Body: secretKey, publishableKey, webhookSecret.
- Makes a test API call to Stripe with the secret key (`stripe.balance.retrieve()`).
- Returns `{ valid: true }` or `{ valid: false, error: 'message' }`.

`POST /api/setup/verify-email`:
- Body: apiKey, fromAddress.
- Sends a test email via Resend to the freelancer's own email (from the tenant row).
- Returns `{ valid: true }` or `{ valid: false, error: 'message' }`.

`POST /api/setup/verify-storage`:
- Body: driver, bucket, region, accessKey, secretKey, endpoint.
- If driver is 'local': returns `{ valid: true }` immediately.
- If driver is 's3': creates an S3 client with provided credentials, calls `HeadBucket` to verify access.
- Returns `{ valid: true }` or `{ valid: false, error: 'message' }`.

**Setup wizard UI** — four-step flow exactly as described in vision-architecture.md Section 4 "First Boot — Setup Wizard (Self-Hosted)":

Step 1 (AccountStep): name, email, password with strength indicator. Validation on "Next."
Step 2 (IntegrationsStep): three cards (Stripe, Email, Storage) each with fields, verify button, skip option. Three visual states per card: unconfigured (grey), verifying (spinner), configured (green check).
Step 3 (BrandingStep): brand name, colour picker with hex input, logo drag-and-drop upload, default currency dropdown, invoice prefix. Live preview card. "Use Defaults" shortcut.
Step 4 (CompleteStep): summary showing configured/skipped items, "Go to Dashboard" button.

Progress indicator at top showing steps 1-4. Back button. Forward-only validation.

**First-boot detection:** The root layout or a middleware checks for tenant existence. If no tenant → redirect all routes to `/setup`. If tenant exists → `/setup` returns 404.

**Tests (Vitest + Supertest):**

- POST `/api/setup` with valid data creates tenant and settings, returns user, sets cookie.
- POST `/api/setup` when tenant exists returns 409.
- Validation errors return 400 with field details.
- Verify endpoints return correct success/failure for valid/invalid credentials (mock external services).

**Acceptance:**

- Fresh database → visiting any route redirects to `/setup`.
- Complete the wizard → tenant and settings created, logged in, redirected to dashboard.
- `/setup` returns 404 after account exists.
- Each integration verify button works (with valid test credentials).
- All tests pass.

---

### Step 11 — Auth Pages

**What:** Login page for freelancer, magic link request page for client, magic link verification, logout, change password, manual login link generation.

**Files:**

```
src/app/api/auth/login/route.ts
src/app/api/auth/magic-link/route.ts
src/app/api/auth/verify/route.ts
src/app/api/auth/logout/route.ts
src/app/api/auth/me/route.ts
src/app/api/auth/change-password/route.ts
src/app/api/clients/[id]/generate-link/route.ts
src/app/(auth)/login/page.tsx
src/app/(auth)/layout.tsx
src/app/(portal)/login/page.tsx
src/app/auth/verify/page.tsx
src/lib/auth/validators.ts
```

**Detail:**

All auth API endpoints exactly as specified in vision-architecture.md Section 5 "Auth Endpoints":

- `POST /api/auth/login`: validate email + password against tenants table. Rate limited. On success: create session, set cookie, return user. On failure: generic 401.
- `POST /api/auth/magic-link`: validate email exists in clients. Rate limited (per email and per IP). If found: generate magic link, send email (if configured). Always return same success message.
- `GET /api/auth/verify?token=`: verify magic link token, create session, redirect to `/portal/projects`. On failure: redirect to error page.
- `POST /api/auth/logout`: destroy session, clear cookie.
- `GET /api/auth/me`: return current user from session.
- `POST /api/auth/change-password`: validate current password, hash new password, update tenant row, destroy all freelancer sessions.
- `POST /api/clients/:id/generate-link`: freelancer only. Generates manual magic link (24-hour expiry). Returns the URL directly in response.

**Auth layout** (`(auth)/layout.tsx`): centred card on minimal background with brand logo/name.

**Freelancer login page** (`(auth)/login/page.tsx`): email + password fields, "Log In" button. Error states: invalid credentials, rate limited. Loading state on button.

**Client login page** (`(portal)/login/page.tsx`): email input, "Send Login Link" button. Pulls brand name/logo from settings (server-side fetched). If email not configured (check via `/api/health` or a settings endpoint): show "Contact your freelancer for a login link" instead of the email form.

**Verify page** (`auth/verify/page.tsx`): processes token from URL, redirects on success. On failure: shows error message with "Request New Link" button.

**Tests (Vitest + Supertest):**

- Login with correct credentials returns 200, sets cookie.
- Login with wrong credentials returns 401, generic message.
- Login when rate limited returns 429.
- Magic link request creates token, sends email (mock). Same response for non-existent email.
- Magic link verify with valid token creates session, redirects. Used token rejected. Expired token rejected.
- Logout destroys session, clears cookie.
- Me returns current user. Unauthenticated returns 401.
- Change password validates current, updates hash, destroys all sessions.
- Generate link returns URL with valid token (24hr expiry).

**Acceptance:**

- Freelancer can log in via email/password and is redirected to dashboard.
- Client can request magic link, receive it (or freelancer generates manually), click it, and be redirected to portal.
- Invalid/expired/used tokens show appropriate error.
- Rate limiting blocks after threshold.
- Password change invalidates all sessions.
- All tests pass.

---

### Step 12 — Dashboard Layout, Portal Layout & Landing Page

**What:** The three visual shells that all page content renders within, plus the landing page and dark mode.

**Files:**

```
src/app/(dashboard)/layout.tsx
src/app/(portal)/layout.tsx
src/app/(landing)/layout.tsx
src/app/(landing)/page.tsx
src/components/layout/DashboardShell.tsx
src/components/layout/Sidebar.tsx
src/components/layout/TopBar.tsx
src/components/layout/PortalShell.tsx
src/components/layout/PortalNav.tsx
src/stores/uiStore.ts
src/stores/notificationStore.ts
src/components/feedback/Toast.tsx
src/components/feedback/NotificationCentre.tsx
src/components/feedback/NotificationBadge.tsx
src/lib/theme/ThemeProvider.tsx
```

**Detail:**

**Dashboard layout:** wraps all `/dashboard/*` routes. Renders `DashboardShell` which contains:
- `Sidebar`: collapsible left sidebar with nav items (Overview, Clients, Projects, Invoices, Analytics, Settings), each with Lucide icon. Expanded: icon + label. Collapsed: icon + tooltip. Collapse toggle at bottom. Active route highlighted. Badge counts placeholder (wired to real data in later steps). Sidebar state from `uiStore.sidebarCollapsed`, persisted across navigation.
- `TopBar`: page title (dynamic from route), search input (placeholder — wired in later step), notification bell with `NotificationBadge` (count from `notificationStore`), clicking bell opens `NotificationCentre` dropdown, user avatar/name dropdown with "Profile" and "Logout" links.
- Initialises `useEventStream` hook to establish SSE connection.

**Portal layout:** wraps all `/portal/*` routes. Renders `PortalShell` which contains:
- `PortalNav`: top horizontal bar — brand logo/name (from settings, fetched server-side), nav links (Projects, Invoices, Messages), unread indicators (red dots from `notificationStore`), user name dropdown with "Profile" modal trigger and "Logout."
- Initialises `useEventStream` hook.

**Landing layout and page:** as described in vision-architecture.md Section 7. Hero with brand name (from settings), tagline (from `portal_welcome_text` or a default), "Client Login" button → `/portal/login`, "Freelancer Login" link → `/login`. Features section with 3-4 cards. Footer with brand name and "Powered by Abyss Global" link.

**Zustand stores:**

`uiStore.ts`:
```typescript
interface UIStore {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}
```
Persisted to localStorage for sidebar state and theme preference.

`notificationStore.ts`:
```typescript
interface NotificationStore {
  notifications: Notification[]
  unreadCount: number
  unreadMessages: Record<string, number>
  addNotification: (notification: Notification) => void
  markAllRead: () => void
  markProjectMessagesRead: (projectId: string) => void
  clearNotifications: () => void
}
```

**Toast system:** integrate shadcn/ui toast or Sonner. Toasts fire for SSE events (info, blue, clickable) and mutation confirmations (success green, error red). Auto-dismiss after 5 seconds.

**NotificationCentre:** dropdown panel from the bell icon. Shows recent notifications chronologically. Each: icon, description, timestamp, clickable → navigates. "Mark all as read" link.

**Dark mode:** `ThemeProvider` component wrapping the root layout. Reads theme from `uiStore`, applies `dark` class to `<html>`. System default detection via `prefers-color-scheme`. Toggle button in dashboard settings (wired in Step 25).

**Required shadcn/ui primitives for this step:** install (copy into `components/ui/`): Button, DropdownMenu, Tooltip, Avatar, Separator, Sheet (for mobile sidebar), ScrollArea.

**Acceptance:**

- Dashboard layout renders with sidebar, top bar, and content area.
- Sidebar collapses and expands, state persists on navigation and page reload.
- Portal layout renders with top nav and content area.
- Landing page renders with brand settings.
- Dark/light mode toggles correctly and persists.
- Toast notifications fire programmatically.
- Notification bell shows count, dropdown opens.
- SSE connection establishes on layout mount.

---

### Step 13 — Shared UI Components

**What:** Reusable components used across multiple features. Built now so feature steps can assemble from them.

**Files:**

```
src/components/data/DataTable.tsx
src/components/data/Pagination.tsx
src/components/data/SearchInput.tsx
src/components/data/EmptyState.tsx
src/components/data/LoadingSkeleton.tsx
src/components/common/FileUpload.tsx
src/components/common/ConfirmDialog.tsx
src/components/common/StatusBadge.tsx
src/components/common/ThreeDotsMenu.tsx
src/components/common/DateDisplay.tsx
src/components/common/MoneyDisplay.tsx
```

**Detail:**

**DataTable:** as specified in vision-architecture.md Section 6 "DataTable Component." Accepts: column definitions, data (array), loading state, pagination state (page, limit, total), sort state, search string, onRowClick, rowActions (3-dot menu items), emptyState config. Renders: table with column headers (clickable for sort with direction indicator), rows, pagination controls, search input with debounce. Loading state shows skeleton rows. Empty state shows icon + title + description + optional action button. Row actions render as a `ThreeDotsMenu` in the last column.

Required shadcn/ui primitives: Table, Input, Select, Skeleton, Badge.

**Pagination:** page controls — previous, next, page number display, items per page selector.

**SearchInput:** debounced text input (300ms). Magnifying glass icon. Placeholder text configurable. Emits onChange with debounced value.

**EmptyState:** centred container with Lucide icon, title, description, optional action button.

**LoadingSkeleton:** configurable skeleton rows matching table or card layouts.

**FileUpload:** drag-and-drop zone + click to browse. Shows: accepted file types (optional), max size. During upload: progress bar. Validates size and extension client-side before upload. Supports single file (deliverables, logo) or multiple (message attachments, max 5). Emits onUpload with file data.

**ConfirmDialog:** modal dialog. Title, description, cancel button, confirm button (red for destructive variant). Emits onConfirm.

Required shadcn/ui primitives: Dialog, AlertDialog.

**StatusBadge:** coloured badge. Accepts status string. Maps to colour based on status type (project statuses, invoice statuses, milestone statuses — use constants from `lib/constants.ts` to determine colour). Renders as shadcn Badge with appropriate variant/colour.

**ThreeDotsMenu:** vertical dots icon button. Opens a dropdown menu with action items. Each item: label, optional icon, onClick handler, optional variant ('destructive'). Optional condition function per item to show/hide.

Required shadcn/ui primitives: DropdownMenu.

**DateDisplay:** formats ISO date string to human-readable format. Relative for recent dates ("2 hours ago"), absolute for older dates ("15 Jan 2026"). Accepts optional format override.

**MoneyDisplay:** formats integer amount (smallest currency unit) with currency symbol. E.g. `150000` + `'GBP'` → `£1,500.00`. Handles all major currency symbols.

**Acceptance:**

- DataTable renders with sample data, sorts on column click, searches with debounce, paginates.
- DataTable shows skeleton loading state and empty state correctly.
- FileUpload accepts valid files, rejects blocked extensions and oversized files.
- ConfirmDialog opens, can cancel or confirm.
- StatusBadge renders correct colour for every status value.
- MoneyDisplay formats correctly for GBP, USD, EUR.
- All components render without console errors.

---

### Step 14 — Clients

**What:** Complete client management feature — API, UI, and tests.

**Files:**

```
src/lib/clients/queries.ts
src/lib/clients/validators.ts
src/lib/clients/actions.ts
src/app/api/clients/route.ts
src/app/api/clients/[id]/route.ts
src/app/api/clients/[id]/restore/route.ts
src/app/api/clients/[id]/generate-link/route.ts   (already created in Step 11)
src/hooks/useClients.ts
src/hooks/useClient.ts
src/app/(dashboard)/clients/page.tsx
src/app/(dashboard)/clients/[id]/page.tsx
src/components/client/ClientCard.tsx
src/components/client/ClientForm.tsx
src/components/client/MetadataEditor.tsx
```

**Detail:**

**API:** all client endpoints exactly as specified in vision-architecture.md Section 5 "Client Endpoints." Every endpoint scoped by `tenantId` from auth context.

`queries.ts`: `getClients(tenantId, filters)` — paginated list with computed `projectCount` and `outstandingAmount` (subqueries). `getClient(tenantId, clientId)` — single client with `totalRevenue`. Both exclude soft-deleted by default.

`validators.ts`: Zod schemas for create and update bodies. Email format validation. Metadata as `z.record(z.string(), z.string())`.

`actions.ts`: `createClient`, `updateClient`, `deleteClient` (soft), `restoreClient`. Each calls `createActivityEvent` after successful mutation. Soft delete also calls `destroyAllClientSessions`.

**React Query hooks:**

`useClients.ts`: `useClients(filters?)` query hook, `useCreateClient()`, `useUpdateClient()`, `useDeleteClient()`, `useRestoreClient()` mutation hooks. Mutations invalidate `useClients` on success.

`useClient.ts`: `useClient(id)` query hook.

**UI:**

Client list page: DataTable with columns (name, company, email, active projects, total revenue, outstanding). Search by name/company/email. "New Client" button in page header opens `ClientForm` dialog. 3-dot menu: Edit (opens `ClientForm` dialog pre-filled), Send Message (navigates to client detail messages tab), Archive (ConfirmDialog), Restore (only visible for soft-deleted when filter active). Row click → client detail page.

Client detail page: client info card at top (name, company, email, phone, notes, metadata). "Edit" button opens `ClientForm` dialog. Four tabs: Projects (placeholder list — wired in Step 15), Invoices (placeholder — wired in Step 20), Messages (placeholder — wired in Step 18), Activity (renders `activity_events` for this client's projects).

`ClientForm`: dialog with fields: name (required), email (required), company, phone, notes. MetadataEditor component below the standard fields.

`MetadataEditor`: key-value pair editor. "Add Field" button adds a row with key input + value input + remove button. Renders existing metadata pairs for editing.

**Tests (Vitest + Supertest):**

- CRUD operations: create, read, update, soft delete, restore.
- Validation: missing name returns 400, duplicate email returns 409.
- Computed fields: projectCount and outstandingAmount return correct values.
- Soft delete: client excluded from default list, included with `include_deleted=true`.
- Client deletion invalidates sessions.
- Pagination, search, sort work correctly.
- Activity events created for each mutation.

**Acceptance:**

- Can create a client, see it in the list, click into detail, edit via modal, soft delete, restore.
- Computed fields show correct values.
- Search, sort, pagination work.
- Metadata editor saves and loads custom key-value fields.
- All tests pass.

---

### Step 15 — Projects (Core)

**What:** Project management — CRUD, multi-client membership, status state machine.

**Files:**

```
src/lib/projects/queries.ts
src/lib/projects/validators.ts
src/lib/projects/actions.ts
src/lib/projects/state-machine.ts
src/app/api/projects/route.ts
src/app/api/projects/[id]/route.ts
src/app/api/projects/[id]/submit-for-approval/route.ts
src/hooks/useProjects.ts
src/hooks/useProject.ts
src/app/(dashboard)/projects/page.tsx
src/app/(dashboard)/projects/[id]/page.tsx
src/app/(portal)/projects/page.tsx
src/app/(portal)/projects/[id]/page.tsx
src/components/project/ProjectCard.tsx
src/components/project/ProjectStatusBadge.tsx
```

**Detail:**

**State machine** (`state-machine.ts`): `validateTransition(currentStatus, newStatus): boolean`. Uses the `PROJECT_TRANSITIONS` map from constants. Throws `ConflictError` with message describing valid transitions from current state.

**API:** all project endpoints from vision-architecture.md. `POST /api/projects` creates project + `project_clients` rows (first client ID = primary). `GET /api/projects` includes computed `milestoneCount`, `completedMilestones`, `unreadMessages`, `clientName`. Client access scoped via `project_clients` membership check. `PATCH /api/projects/:id` validates status transitions via state machine. `DELETE` is soft delete.

**React Query hooks:** `useProjects(filters?)`, `useProject(id)`, `useCreateProject()`, `useUpdateProject()`, `useDeleteProject()`, `useSubmitForApproval()`.

**Dashboard project list:** DataTable with status filter tabs (All, Active, Pending Lock-In, Pending Approval, Completed, Archived). Columns: name, client(s), status badge, milestone progress, budget, due date, unread messages. "New Project" button → modal with name, client multi-select (searchable, first = primary), description, budget, currency, dates. Row click → project detail.

**Dashboard project detail:** header with project name (inline editable), status badge, client name(s) (clickable), budget, dates, action buttons based on status. Tabbed: Milestones (placeholder), Messages (placeholder), Invoices (placeholder), Activity. Action buttons: "Send for Lock-In" (draft → pending_lockin), "Submit for Approval" (active → pending_approval), "Pause"/"Resume", "Archive".

**Portal project list:** project cards (not DataTable) grouped into Active and Completed. Each card: name, status badge, milestone progress bar, unread count, due date.

**Portal project detail:** scrollable single page. Header with status banners (lock-in or completion). Sections: Milestones (placeholder), Invoices (placeholder), Messages (placeholder).

**Tests (Vitest + Supertest):**

- CRUD operations with multi-client membership.
- State machine: every valid transition succeeds, every invalid transition returns 409.
- Client scoping: client can only see projects they're a member of.
- Computed fields return correct values.
- Activity events created for all mutations and status changes.
- SSE events pushed for status changes.

**Acceptance:**

- Can create a project with one or multiple clients, see it in lists, navigate to detail.
- Status transitions enforce the state machine.
- Client scoping works — client sees only their projects.
- Primary client correctly identified.
- Dashboard and portal views both render correctly.
- All tests pass.

---

### Step 16 — Lock-In Flow

**What:** The mutual confirmation flow for projects.

**Files:**

```
src/app/api/projects/[id]/lock-in/route.ts
src/components/project/LockInBanner.tsx
src/hooks/useLockIn.ts
```

**Detail:**

`POST /api/projects/:id/lock-in`: client only, own project, must be in `pending_lockin` status. Moves status to `active`. Creates activity event `project.locked_in`. Pushes SSE event to freelancer.

`LockInBanner`: shown in portal project detail when status is `pending_lockin`. Displays project details for review (name, description, budget, milestones if any). "Lock In" button with confirmation dialog: "You're confirming the project scope, milestones, and budget. Ready to lock it in?" On confirm: calls API, status updates, banner disappears, toast "Project locked in."

Dashboard project detail: "Send for Lock-In" button in header when status is `draft`. Calls `PATCH /api/projects/:id` with `{ status: 'pending_lockin' }`. Creates activity event. Pushes SSE to client.

`useLockIn()`: mutation hook wrapping the lock-in API call. Invalidates `useProject` and `useProjects` on success.

**Tests (Vitest + Supertest):**

- Lock-in succeeds when status is `pending_lockin`, client is on project.
- Lock-in fails when status is not `pending_lockin` (409).
- Lock-in fails for non-member client (404).
- Activity event and SSE event created.
- Freelancer cannot lock in (403).

**Acceptance:**

- Freelancer creates project → sends for lock-in → client sees banner → client locks in → status is active.
- Invalid transitions blocked.
- Both parties see real-time status update via SSE.
- All tests pass.

---

### Step 17 — Milestones & Deliverables

**What:** Milestone management and file deliverable handling with versioning and release gating.

**Files:**

```
src/lib/milestones/queries.ts
src/lib/milestones/validators.ts
src/lib/milestones/actions.ts
src/lib/deliverables/queries.ts
src/lib/deliverables/validators.ts
src/lib/deliverables/actions.ts
src/app/api/projects/[id]/milestones/route.ts
src/app/api/milestones/[id]/route.ts
src/app/api/milestones/[id]/approve/route.ts
src/app/api/projects/[id]/deliverables/route.ts
src/app/api/deliverables/[id]/route.ts
src/app/api/deliverables/[id]/download/route.ts
src/hooks/useMilestones.ts
src/hooks/useDeliverables.ts
src/components/project/MilestoneList.tsx
src/components/project/MilestoneItem.tsx
src/components/project/DeliverableRow.tsx
```

**Detail:**

**Milestones API:** all endpoints from vision-architecture.md. No pagination — full list ordered by position. Position change triggers reorder of siblings. Delete blocked if linked to paid invoices.

**Deliverables API:** upload via multipart form data. `parentDeliverableId` for versioning — version auto-incremented. Storage key: `deliverables/{projectId}/{milestoneId}/{deliverableId}/{filename}`. Download: stream response with `Content-Disposition: attachment`. Release gate: client download returns 402 if `released = false`. Release toggle: freelancer PATCH to update `released` boolean.

**Milestone approval:** `POST /api/milestones/:id/approve`. Primary client only. Milestone must be in `review` status. Moves to `approved`. Activity event + SSE.

**UI — Dashboard project detail Tab 1:**

`MilestoneList`: ordered list of `MilestoneItem` components. "Add Milestone" button → dialog (name, description, due date). Drag handles for reorder (update position values via API).

`MilestoneItem`: expandable card. Collapsed: name, status badge, due date, deliverable count. Expanded: description (editable inline), status dropdown (freelancer changes: pending → in_progress → review), due date picker, deliverables section. Delete in 3-dot menu (with ConfirmDialog, blocked message if paid invoices linked).

`DeliverableRow` inside expanded milestone: filename, file size, version badge ("v3"), upload date, release toggle switch (freelancer), download button. "Upload Deliverable" button/zone. If versioned: "Previous versions" expandable section showing older versions.

**UI — Portal project detail Section 1 (Milestones):**

Same milestone list but read-only. No drag, no status dropdown, no edit. Deliverables shown: released ones have download button, unreleased show "Pending release" greyed label. Primary client sees "Approve Milestone" button on `review` status milestones.

**Tests (Vitest + Supertest):**

- Milestone CRUD, position reordering.
- Deliverable upload, download, versioning (parent chain).
- Release gate: client blocked from downloading unreleased deliverable (402). Freelancer always allowed.
- Milestone approval: only primary client, only `review` status.
- Delete blocked when linked to paid invoices.
- File stored correctly via storage adapter, downloadable.
- Activity events and SSE for all mutations.

**Acceptance:**

- Can create milestones, reorder, change status, delete.
- Can upload deliverables, upload new versions, toggle release.
- Client can download released, blocked from unreleased.
- Primary client can approve milestones.
- All tests pass.

---

### Step 18 — Messages & Attachments

**What:** Two-level messaging system with file attachments and real-time delivery.

**Files:**

```
src/lib/messages/queries.ts
src/lib/messages/validators.ts
src/lib/messages/actions.ts
src/app/api/projects/[id]/messages/route.ts
src/app/api/clients/[id]/messages/route.ts
src/app/api/messages/[id]/attachments/[attachmentId]/download/route.ts
src/hooks/useMessages.ts
src/components/messaging/MessageThread.tsx
src/components/messaging/MessageBubble.tsx
src/components/messaging/MessageComposer.tsx
src/components/messaging/AttachmentPreview.tsx
src/app/(dashboard)/projects/[id]/messages/page.tsx
src/app/(portal)/messages/page.tsx
```

**Detail:**

**Two levels:**
1. Client-level: `GET/POST /api/clients/:id/messages` — messages where `project_id IS NULL` and `client_id = :id`.
2. Project-level: `GET/POST /api/projects/:id/messages` — messages where `project_id = :id`.

Both follow the same message format from vision-architecture.md. GET supports pagination (default 50, asc order), `since` filter, `search` (ILIKE on body). POST accepts multipart: body + optional files (max 5). Creates `message_attachments` rows for files. Storage key: `messages/{projectId or 'client'}/{messageId}/{filename}`.

Attachment download: `GET /api/messages/:id/attachments/:attachmentId/download`. Both roles, own project. No release gate — message attachments are always downloadable.

`senderName` denormalised in response — joined from tenants or clients table based on `sender_type`.

**SSE integration:** on new message, push `message.new` event to the other party. Freelancer sends → push to all clients on the project (or the specific client for client-level). Client sends → push to freelancer.

**UI components:**

`MessageThread`: scrollable container. Messages rendered as `MessageBubble` components chronologically. "Load earlier messages" button at top (pagination). Auto-scrolls to bottom on new messages.

`MessageBubble`: sender name, timestamp, body text, attachment chips (if any). Freelancer messages on right, client messages on left (or vice versa depending on viewer). Attachment chips: file icon + filename, clickable → download.

`MessageComposer`: text input (multiline), attachment button (opens file picker, max 5 files), send button. Shows attached files as removable chips before sending. Disabled while sending (loading state).

`AttachmentPreview`: file icon based on MIME type, filename, file size. Remove button (before sending).

**Dashboard integration:** client detail page Tab 3 (Messages) renders client-level chat. Project detail Tab 2 (Messages) renders project-level chat. Full-page message view at `/dashboard/projects/:id/messages`.

**Portal integration:** `/portal/messages` page with two sections: General Messages (client-level chat) and Project Chats (list of projects with last message preview, click → project detail scrolled to messages). Project detail Section 3 renders project-level chat.

**Unread tracking:** when `message.new` SSE event arrives and user is NOT viewing that thread, increment `unreadMessages[projectId]` in notificationStore. When user opens that thread, call `markProjectMessagesRead(projectId)`. Red dots on portal nav "Messages" and individual project cards.

**Tests (Vitest + Supertest):**

- Send and receive messages at both levels.
- Attachment upload and download.
- Pagination with `since` filter.
- Search within messages.
- Client scoping: client can only access messages on their own projects.
- SSE delivery: message push reaches the other party.
- senderName correctly resolved.

**Acceptance:**

- Freelancer and client can exchange messages at both client-level and project-level.
- Attachments upload and download correctly.
- Messages appear in real-time via SSE.
- Unread indicators update correctly.
- Search within messages works.
- All tests pass.

---

### Step 19 — Proposals

**What:** Proposal negotiation system as structured message types within the messaging system.

**Files:**

```
src/lib/messages/proposal-actions.ts
src/lib/messages/proposal-validators.ts
src/components/project/ProposalCard.tsx
src/components/project/ProposalCounterModal.tsx
```

**Detail:**

**Proposal message types** are sent via the existing message endpoints with `type` field set. The message body is a human-readable summary; the structured data lives in `proposal_data`.

`proposal_data` JSON structure (validated by Zod):
```typescript
{
  name: string,
  description: string,
  budget: number,
  currency: string,
  milestones: Array<{ name: string, description?: string, dueDate?: string }>
}
```

**Actions:**

`sendProposal(tenantId, clientId, senderId, senderType, proposalData)`: creates a message with `type: 'proposal'`, `proposal_data` set, `project_id: null` (client-level). Body auto-generated: "Proposed project: {name} — {budget} {currency}".

`sendCounter(tenantId, clientId, senderId, senderType, proposalId, amendedData)`: creates a message with `type: 'counter'`, references `proposal_id`, updated `proposal_data`. Body: "Counter-proposal: {name} — {budget} {currency}".

`acceptProposal(tenantId, clientId, senderId, senderType, proposalId)`: creates `type: 'accept'` message. **Then auto-creates project and milestones** from the latest `proposal_data` in the chain (the accepted proposal or counter). Sets `proposal_message_id` on the project. Project created in `active` status (both parties have implicitly agreed). Activity event: `project.created` with `{ source: 'proposal' }`.

`rejectProposal(tenantId, clientId, senderId, senderType, proposalId)`: creates `type: 'reject'` message. No project creation.

**UI:**

`ProposalCard`: rendered inside `MessageThread` when message type is `proposal` or `counter`. Shows: header ("Project Proposal" / "Counter-Proposal"), project name, description (collapsible), budget + currency, milestones list. Footer actions (only on the latest proposal/counter in the chain, only for the receiving party): "Accept" button, "Counter" button, "Reject" button. Previous proposals/counters show as cards with disabled actions.

`ProposalCounterModal`: opened when "Counter" is clicked. Pre-filled with current proposal data. All fields editable: name, description, budget, currency, milestones (add/remove/edit). "Send Counter" button.

Accept action: confirmation dialog → calls `acceptProposal` → project created → toast with link to new project.

Reject action: confirmation dialog → calls `rejectProposal` → proposal marked declined.

**Finding the latest active proposal:** query messages in the proposal chain (via `proposal_id` references). The latest message that is `type: 'proposal'` or `type: 'counter'` (not followed by `accept` or `reject`) is the active one.

**Tests (Vitest + Supertest):**

- Send proposal creates correct message type with proposal_data.
- Send counter references original proposal, carries amended data.
- Accept creates project + milestones matching proposal data, sets proposal_message_id.
- Reject creates reject message, no project.
- Only receiving party can accept/counter/reject.
- Multiple counter rounds work correctly.
- Project creation from proposal has correct client membership.

**Acceptance:**

- Either party can send a proposal in client-level chat.
- Counter with amended terms works.
- Accept auto-creates project with correct name, budget, milestones.
- Reject ends the negotiation.
- Only the latest active proposal has live action buttons.
- All tests pass.

---

### Step 20 — Invoices

**What:** Complete invoicing system — creation, line items, sending, settlement, payment.

**Files:**

```
src/lib/invoices/queries.ts
src/lib/invoices/validators.ts
src/lib/invoices/actions.ts
src/lib/invoices/settlement.ts
src/app/api/invoices/route.ts
src/app/api/invoices/[id]/route.ts
src/app/api/invoices/[id]/send/route.ts
src/app/api/invoices/[id]/pay/route.ts
src/app/api/invoices/[id]/settle/route.ts
src/hooks/useInvoices.ts
src/hooks/useInvoice.ts
src/app/(dashboard)/invoices/page.tsx
src/app/(dashboard)/invoices/new/page.tsx
src/app/(dashboard)/invoices/[id]/page.tsx
src/app/(portal)/invoices/page.tsx
src/app/(portal)/invoices/[id]/page.tsx
src/components/invoicing/InvoiceForm.tsx
src/components/invoicing/LineItemEditor.tsx
src/components/invoicing/InvoicePreview.tsx
src/components/invoicing/PaymentButton.tsx
src/components/invoicing/SettlementModal.tsx
```

**Detail:**

**API:** all invoice endpoints from vision-architecture.md. Invoice number auto-generated from `settings.invoice_prefix` + `settings.invoice_next_number` (atomically increment). Amount defaults to sum of line items but is overridable. Line item updates replace all existing items (delete + recreate).

**Send** (`POST /api/invoices/:id/send`): draft → sent. Sets `sent_at`. Creates Stripe Checkout Session (if Stripe configured). Sends invoice notification email (if email configured). Activity event + SSE.

**Pay** (`POST /api/invoices/:id/pay`): client only, sent/overdue. Creates fresh Stripe Checkout Session. Returns `{ checkoutUrl }`. Frontend redirects to Stripe.

**Settle** (`POST /api/invoices/:id/settle`): freelancer only. Validates body (amountReceived, paymentMethod from allowed list, reference required). Status → settled. Stores settlement_data. Sets paid_at. **Auto-releases deliverables** on linked milestones (via invoice_milestones → milestones → deliverables SET released = true). Activity event + SSE.

**Stripe Checkout Session creation:**
```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  payment_method_types: ['card'],
  line_items: [{
    price_data: {
      currency: invoice.currency.toLowerCase(),
      unit_amount: invoice.amount,
      product_data: { name: `Invoice ${invoice.invoiceNumber}` }
    },
    quantity: 1
  }],
  metadata: { invoiceId: invoice.id, tenantId: invoice.tenantId },
  success_url: `${APP_URL}/portal/invoices/${invoice.id}?payment=success`,
  cancel_url: `${APP_URL}/portal/invoices/${invoice.id}?payment=cancelled`
})
```

Update invoice with `stripe_checkout_session_id`.

**UI — Dashboard:**

Invoice list: DataTable with status filter tabs. 3-dot menu: Send (if draft), Duplicate, Cancel (ConfirmDialog, if not paid/settled).

Invoice creation (`/dashboard/invoices/new`): full page form exactly as specified in vision-architecture.md. `InvoiceForm` with: client selector (searchable dropdown), project selector (filtered to client's projects), milestone linker (multi-select from selected project's milestones), `LineItemEditor` (add/remove rows, description, quantity, unit price, computed line total, running total), amount override field, notes textarea, due date picker, currency dropdown. "Save as Draft" and "Save & Send" buttons.

`LineItemEditor`: table with add row button. Each row: description (text), quantity (number), unit price (money input), line total (computed, read-only), remove button. Running total below.

Invoice detail: `InvoicePreview` (formatted invoice as client sees it) + action bar. Actions based on status as specified.

`SettlementModal`: amount received (pre-filled with invoice amount, editable), payment method dropdown (bank_transfer, platform_payment, paypal, cash, crypto, other), reference text field (required). "Settle Invoice" button.

**UI — Portal:**

Invoice list: DataTable with status tabs (All, Unpaid, Paid). Click → invoice detail.

Invoice detail (modal or page): full `InvoicePreview` with `PaymentButton` for sent/overdue invoices. "Paid" badge for paid/settled.

`PaymentButton`: "Pay Now" button. Calls pay endpoint, receives checkout URL, redirects to Stripe.

**Tests (Vitest + Supertest):**

- CRUD operations with line items.
- Invoice number auto-increment.
- Amount override works.
- Send: status change, email sent (mock), checkout session created (mock Stripe).
- Pay: returns checkout URL (mock Stripe).
- Settle: status change, settlement_data stored, deliverables auto-released.
- Cannot edit/delete paid or settled invoices.
- Client scoping: client sees only their invoices.
- Activity events and SSE for all state changes.

**Acceptance:**

- Can create invoices with line items, send, settle, cancel.
- Client can view invoice and initiate payment.
- Deliverables auto-release on settlement.
- Invoice numbers auto-increment correctly.
- All tests pass.

---

### Step 21 — Stripe Webhook Handler

**What:** Webhook endpoint that processes Stripe payment events.

**Files:**

```
src/app/api/webhooks/stripe/route.ts
src/lib/stripe/webhook.ts
src/lib/stripe/checkout.ts
```

**Detail:**

`route.ts`: POST handler. Reads raw body. Verifies signature using `stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)`. On invalid signature: 400. Routes to handler functions based on event type.

`webhook.ts`:

`handleCheckoutCompleted(event)`:
1. Extract `invoiceId` and `tenantId` from `event.data.object.metadata`.
2. Look up invoice. If not found → log warning, return.
3. If already `paid` or `settled` → return (idempotent).
4. Update: `status = 'paid'`, `paid_at = now()`, `stripe_payment_intent_id = event.data.object.payment_intent`.
5. Auto-release: `invoice_milestones` → milestone IDs → `UPDATE deliverables SET released = true WHERE milestone_id IN (...)`.
6. Create activity event: `invoice.paid`.
7. Push SSE: `invoice.paid` to freelancer, `deliverable.released` to client for each released deliverable.

`handleCheckoutExpired(event)`:
1. Extract `invoiceId` from metadata.
2. Create activity event: `invoice.payment_attempted` with `{ outcome: 'session_expired' }`.
3. No invoice status change.

All handlers return 200 with `{ received: true }`.

`checkout.ts`: exports `createCheckoutSession(invoice, tenant)` used by the invoice send and pay endpoints. Centralises Checkout Session creation logic.

**Tests (Vitest + Supertest):**

- Valid webhook with correct signature processes: invoice marked paid, deliverables released, events created.
- Invalid signature returns 400.
- Duplicate processing (already paid invoice) is idempotent — no double events.
- Expired session creates activity event but no status change.
- Auto-release correctly targets deliverables linked to the invoice's milestones.

**Acceptance:**

- Webhook endpoint correctly processes `checkout.session.completed`.
- Invoice marked paid, deliverables auto-released.
- Idempotent — safe to receive same event twice.
- All tests pass.

---

### Step 22 — Project Completion Flow

**What:** Submit for approval, accept, and dispute flows.

**Files:**

```
src/app/api/projects/[id]/accept/route.ts
src/app/api/projects/[id]/dispute/route.ts
src/components/project/CompletionFlow.tsx
```

**Detail:**

`POST /api/projects/:id/submit-for-approval` (already created in Step 15 — ensure it's fully wired): freelancer only, `active` → `pending_approval`. Activity event + SSE to client.

`POST /api/projects/:id/accept`: primary client only, `pending_approval` → `completed`. Activity event + SSE to freelancer.

`POST /api/projects/:id/dispute`: primary client only, `pending_approval` → `active`. Body: `{ reason: string }` (min 10 chars). Server-side effects:
1. Status reverts to `active`.
2. Message created in project thread: `sender_type: 'client'`, body: "[Completion Disputed] {reason}".
3. Activity event: `project.disputed` with reason in metadata.
4. SSE to freelancer.

`CompletionFlow` component: rendered in portal project detail when status is `pending_approval`. Banner with: "The freelancer has marked this project as complete." Two buttons: "Accept" (confirmation dialog → accept endpoint) and "Dispute" (opens dialog with textarea for reason, min 10 chars, submit calls dispute endpoint).

**Tests (Vitest + Supertest):**

- Submit for approval: active → pending_approval. Fails from other statuses.
- Accept: pending_approval → completed. Only primary client.
- Dispute: pending_approval → active. Reason logged as message and activity event. Only primary client.
- Non-primary client cannot accept or dispute (403).
- Freelancer cannot accept or dispute (403).
- SSE events fire for all transitions.

**Acceptance:**

- Freelancer submits → client sees banner → accept or dispute.
- Dispute reverts status, reason appears in message thread.
- Only primary client can accept/dispute.
- All tests pass.

---

## PHASE C — DASHBOARD & ANALYTICS

---

### Step 23 — Dashboard Overview

**What:** The freelancer's daily command centre — the first page they see.

**Files:**

```
src/app/(dashboard)/page.tsx        (replace placeholder)
src/components/analytics/StatCard.tsx
src/components/analytics/RevenueChart.tsx
```

**Detail:**

Dashboard overview page exactly as specified in vision-architecture.md Section 7 "Freelancer Dashboard — `/dashboard`":

**Top row — stat cards (4):** revenue this month (amount + % change from last month), outstanding invoices (total unpaid + count), active projects (count), unread messages (total from notificationStore). Each card clickable → navigates to relevant section.

**"Needs Attention" section:** prioritised list of actionable items fetched from existing endpoints with appropriate filters. Types: projects awaiting client lock-in, disputed projects, overdue invoices (with days overdue), unread messages per project. Items sorted by priority: disputes and overdue first, then pending, then informational. Max 10, "View all" link. Each item clickable → navigates to resource.

**"Active Projects" section:** compact list from `useProjects({ status: 'active' })`. Each row: name, client name(s), milestone progress bar, due date, unread count. Click → project detail. "View all projects" link.

**"Recent Activity" section:** last 15 activity events from `useActivity({ limit: 15 })`. Chronological. Each: icon by type, description, timestamp, clickable.

**Revenue chart:** `RevenueChart` component. Bar chart showing monthly revenue for the last 6 months. Data from `useAnalyticsRevenue({ period: '12m' })` (use last 6 entries). Hoverable bars show exact values. Use Recharts library (already available from shadcn).

`StatCard`: reusable card component. Icon, label, value (large), optional trend indicator (↑ green / ↓ red with percentage).

**Acceptance:**

- Dashboard shows correct real-time stats.
- Needs Attention prioritises correctly.
- All items clickable, navigate to correct detail.
- Revenue chart renders.
- Empty states handle gracefully for new accounts.

---

### Step 24 — Analytics Page

**What:** Full analytics with revenue, project, and client breakdowns.

**Files:**

```
src/lib/analytics/queries.ts
src/app/api/analytics/revenue/route.ts
src/app/api/analytics/projects/route.ts
src/app/api/analytics/clients/route.ts
src/hooks/useAnalytics.ts
src/app/(dashboard)/analytics/page.tsx
src/components/analytics/RevenueByClient.tsx
src/components/analytics/ProjectStatusChart.tsx
```

**Detail:**

**API:** all three analytics endpoints from vision-architecture.md. Queries aggregate data from invoices, projects, clients tables scoped by tenant. Revenue endpoint supports period filter (30d, 90d, 12m, all).

`queries.ts`: raw SQL or Drizzle queries for aggregations. Revenue by month: GROUP BY month from `paid_at` or `paid_at` from settled invoices. Revenue by client: SUM of paid/settled invoice amounts grouped by client. Project stats: COUNT by status, AVG duration for completed projects. Client stats: COUNT total, COUNT active (with active projects).

**UI:** as specified in vision-architecture.md Section 7 "Freelancer Dashboard — `/dashboard/analytics`":

Period selector at top (30d, 90d, 12m, All). Stat cards: total revenue, outstanding, overdue, average invoice, paid count. Revenue by month (bar chart). Revenue by client (horizontal bar or list). Project distribution by status (donut chart). Average duration. Completion rate. Top clients table.

Use Recharts for all charts: `BarChart`, `PieChart` / `RadialBarChart`.

**Tests (Vitest + Supertest):**

- Revenue endpoint returns correct totals for each period.
- Monthly breakdown matches actual invoice data.
- Client breakdown sums correctly.
- Project stats return correct counts and averages.
- Empty database returns zero values, not errors.

**Acceptance:**

- Analytics page renders all sections with correct data.
- Period filter updates all charts and stats.
- Charts render accurately.
- All tests pass.

---

### Step 25 — Settings Page

**What:** Instance configuration — branding, invoicing, portal, sessions, account.

**Files:**

```
src/app/api/settings/route.ts
src/app/api/settings/logo/route.ts
src/app/api/sessions/route.ts
src/app/api/sessions/[id]/route.ts
src/hooks/useSettings.ts
src/hooks/useSessions.ts
src/app/(dashboard)/settings/page.tsx
src/components/settings/BrandingForm.tsx
src/components/settings/GeneralSettings.tsx
src/components/settings/SessionsList.tsx
```

**Detail:**

**API:** all settings and sessions endpoints from vision-architecture.md. Settings CRUD scoped by tenant. Logo upload via multipart to storage adapter, updates `settings.logo_url`. Sessions list returns active client sessions with client name/email joined. Session revoke deletes the session row.

**UI:** as specified in vision-architecture.md Section 7 "Freelancer Dashboard — `/dashboard/settings`":

Five independent sections, each with its own save button:

1. **Branding:** brand name, colour picker with hex input, logo upload (current shown with Change/Remove). Live preview card showing portal nav appearance.
2. **Invoicing:** default currency dropdown, invoice prefix, next invoice number (editable), payment instructions textarea.
3. **Portal:** welcome text textarea (shown on landing page hero).
4. **Active Sessions:** `SessionsList` — table of active client sessions (name, email, created, expires). "Revoke" button per row (ConfirmDialog). "Revoke All" button.
5. **Account:** name, email, company, phone, avatar upload. "Save" button. Password change: current password, new password, confirm new password. "Change Password" button with warning about session invalidation.

Dark mode toggle also lives here (light/dark/system selector from uiStore).

**Tests (Vitest + Supertest):**

- Settings CRUD operations.
- Logo upload stores file, updates URL.
- Sessions list returns correct data.
- Session revoke deletes session.
- Password change invalidates all sessions.

**Acceptance:**

- All settings update and take effect immediately.
- Brand changes visible in portal nav and landing page.
- Session management works.
- Password change forces re-login.
- All tests pass.

---

## PHASE D — TESTING & POLISH

---

### Step 26 — API Test Suite

**What:** Comprehensive API test coverage for every endpoint.

**Files:**

```
src/__tests__/api/auth.test.ts
src/__tests__/api/clients.test.ts
src/__tests__/api/projects.test.ts
src/__tests__/api/milestones.test.ts
src/__tests__/api/deliverables.test.ts
src/__tests__/api/messages.test.ts
src/__tests__/api/invoices.test.ts
src/__tests__/api/analytics.test.ts
src/__tests__/api/settings.test.ts
src/__tests__/api/activity.test.ts
src/__tests__/api/webhooks.test.ts
src/__tests__/helpers/setup.ts        (test database setup/teardown, auth helpers)
```

**Detail:**

`helpers/setup.ts`: test database connection, `beforeAll` creates test tenant and settings, `afterAll` cleans up. Helper functions: `createTestTenant()`, `createTestClient()`, `createTestProject()`, `authenticateAsFreelancer()`, `authenticateAsClient()` — return session cookies for use in requests.

Each test file covers its resource's endpoints with:

- **Success cases:** every endpoint returns correct data shape.
- **Validation errors:** missing required fields, invalid types, constraint violations.
- **Auth rejection:** request without session returns 401.
- **Role-based access:** client accessing freelancer-only endpoint returns 403. Freelancer accessing client-only endpoint returns 403.
- **Client data scoping:** client A's request for client B's resource returns 404.
- **State machine:** invalid project/milestone status transitions return 409.
- **Pagination:** correct page, limit, total values.
- **Search:** returns matching results, excludes non-matching.
- **Sort:** results in correct order.
- **Edge cases:** soft-deleted resources, duplicate email on client create, file upload size/type limits.

Webhook tests: valid signature processes correctly, invalid signature returns 400, idempotent processing.

**Acceptance:**

- `pnpm test` runs the full suite and all tests pass.
- Every endpoint has at least one success case and relevant error cases.
- Client scoping verified — client A cannot access client B's data through any endpoint.

---

### Step 27 — E2E Test Suite

**What:** Playwright end-to-end tests for critical user flows.

**Files:**

```
e2e/setup.spec.ts
e2e/freelancer-flow.spec.ts
e2e/client-flow.spec.ts
e2e/proposal-flow.spec.ts
e2e/completion-flow.spec.ts
e2e/auth.spec.ts
playwright.config.ts
```

**Detail:**

`playwright.config.ts`: base URL, headless Chromium, test database setup.

**Test flows** exactly as specified in vision-architecture.md Section 11:

`setup.spec.ts`: visit root → redirected to /setup → complete wizard (all 4 steps) → redirected to dashboard → /setup now returns 404.

`freelancer-flow.spec.ts`: login → create client → create project → add milestones → upload deliverable → create invoice → send invoice → settle invoice → verify deliverable released.

`client-flow.spec.ts`: magic link login (generate link, visit it) → view projects → view project detail → view milestones → attempt download unreleased (blocked) → pay invoice (mock Stripe) → download released deliverable → approve milestone.

`proposal-flow.spec.ts`: freelancer sends proposal → client sees it → client counters → freelancer accepts → project auto-created with correct details.

`completion-flow.spec.ts`: freelancer submits for approval → client disputes with reason → reason appears in messages → freelancer resubmits → client accepts → project completed.

`auth.spec.ts`: login, logout, session persistence across navigation, rate limiting (multiple failed attempts).

**Acceptance:**

- `pnpm test:e2e` runs all flows in headless Chromium and all pass.
- Each flow tests the complete user journey from start to finish.

---

### Step 28 — Polish & Documentation

**What:** Final quality pass, documentation generation, and build report.

**Files:**

```
README.md                (finalised)
cortex-context/          (build artifacts directory)
  directive.md
  build-log.md
  implementation-plan.md
src/app/api/health/route.ts   (enhanced)
```

**Detail:**

**Health check enhancement:** update to return full status as specified — version, database connectivity (test query), storage availability (exists check), email configured (env check), payments configured (env check), uptime.

**README finalisation:** complete all sections from vision-architecture.md Section 9:
- Product description and feature list.
- Quick start (three commands).
- Screenshots section (placeholder image paths — screenshots added after deployment).
- Configuration table (all env vars).
- One-click deploy buttons (Railway, Render, Fly.io).
- Build Report section: total build time, cycles, cost, lines of code, test count.
- "Built by Abyss Global" section.
- Link to documentation.
- MIT licence.

**Cortex build artifacts:** place copies of the vision-architecture.md and this implementation plan in `cortex-context/`.

**Final quality checks:**
- `pnpm lint` — Biome passes with zero errors.
- `pnpm build` — production build succeeds.
- No console errors in production build.
- All empty states render correctly across all pages.
- All loading skeleton states render correctly.
- All error states render correctly (simulate API failure).
- Responsive behaviour: dashboard usable at 1024px width, portal usable at 768px width.
- Dark mode: all pages render correctly in both light and dark.

**Acceptance:**

- README is publication-ready.
- Health check returns complete status.
- Biome lint passes.
- Production build succeeds.
- All visual states (empty, loading, error) render correctly.
- Responsive at specified breakpoints.
- Dark mode complete.

---

## PHASE E — MANAGED SAAS PLATFORM

These steps add the multi-tenancy layer. The core product is already complete and tested. These steps add managed-mode logic without modifying the self-hosted behaviour.

---

### Step 29 — Multi-Tenancy Foundation

**What:** Platform mode detection, tenant routing middleware, row-level security, and the platform service abstraction.

**Files:**

```
src/lib/platform/index.ts              (mode detection + getPlatformConfig)
src/lib/platform/tenant-middleware.ts   (subdomain → tenant resolution)
src/lib/platform/rls.ts                (row-level security setup)
src/lib/platform/tier-config.ts        (tier configuration constants)
```

**Detail:**

`index.ts`:
- `getPlatformMode(): 'self-hosted' | 'managed'` — reads `PLATFORM_MODE` env var, defaults to `'self-hosted'`.
- `getPlatformConfig()`: returns configuration object that abstracts mode differences. Includes: `isManaged`, `isSelfHosted`, stripe mode (direct vs connect), email mode (tenant-configured vs centralised), storage mode (tenant-configured vs platform-managed).
- All mode-dependent decisions in the codebase go through this abstraction.

`tenant-middleware.ts`:
- In managed mode: extracts subdomain from `Host` header, looks up `tenants` by `subdomain`. If not found → 404. If found → sets `tenantId` in request context and sets Postgres session variable `app.current_tenant_id`.
- In self-hosted mode: looks up the single tenant row, sets it in context. No subdomain parsing.
- This middleware runs before auth middleware on every request.

`rls.ts`:
- SQL statements to enable row-level security on every tenant-scoped table.
- Policy: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`.
- Applied via a migration or an initialisation function.
- In self-hosted mode: RLS can be disabled (single tenant, no risk) or enabled (defence in depth). Configured via platform mode.

`tier-config.ts`:
- The `TIER_CONFIG` constant exactly as specified in vision-architecture.md Section 10.
- All values are configurable placeholders.
- Export `getTierConfig(tier: string)` helper.

**Tests:**

- `getPlatformMode` returns correct mode based on env var.
- Tenant middleware resolves subdomain to correct tenant.
- Tenant middleware returns 404 for unknown subdomain.
- Self-hosted mode resolves single tenant without subdomain.
- RLS policies block cross-tenant queries.

**Acceptance:**

- Mode detection works correctly.
- Subdomain routing resolves tenants.
- RLS prevents cross-tenant data access at database level.
- All tests pass.

---

### Step 30 — Managed Auth & Onboarding

**What:** Tenant signup flow and managed-mode onboarding wizard.

**Files:**

```
src/app/api/auth/signup/route.ts
src/app/(auth)/signup/page.tsx
src/components/onboarding/ManagedSetupWizard.tsx
src/components/onboarding/StripeConnectStep.tsx
src/components/onboarding/SubdomainStep.tsx
```

**Detail:**

`POST /api/auth/signup` (managed mode only):
- Body: name, email, password, subdomain.
- Validates subdomain uniqueness, format (lowercase alphanumeric + hyphens, min 3 chars).
- Creates tenant row with `subscription_tier: 'starter'`.
- Creates settings row with defaults.
- Creates session, sets cookie.
- Creates platform event: `tenant.signup`.

**Managed onboarding** — four steps as specified in vision-architecture.md Section 10 "Managed Onboarding":

Step 1 (Account): name, email, password.
Step 2 (StripeConnectStep): "Connect Stripe" button → Stripe Connect OAuth. Skip option.
Step 3 (SubdomainStep): subdomain input with live availability check + live preview (`{input}.platformdomain.com`). Brand name, colour, logo, currency, invoice prefix.
Step 4 (Complete): summary, portal URL, "Go to Dashboard."

**Admin account creation:** on first platform boot, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars are set and no admin user exists, create the admin tenant row with `user_type` override or a separate mechanism (could be a flag column `is_admin` on tenants, or check against env vars at login time).

**Tests:**

- Signup creates tenant with correct tier and settings.
- Duplicate subdomain returns 409.
- Invalid subdomain format returns 400.
- Admin account created from env vars on first boot.

**Acceptance:**

- New user can sign up, select subdomain, and reach their dashboard.
- Subdomain validation works.
- Admin can log in.
- All tests pass.

---

### Step 31 — Stripe Connect

**What:** Connected account creation, OAuth flow, and payment routing with platform fees.

**Files:**

```
src/lib/stripe/connect.ts
src/app/api/stripe/connect/route.ts
src/app/api/stripe/connect/callback/route.ts
```

**Detail:**

`connect.ts`:
- `createConnectedAccount(tenantId)`: creates a Stripe Connect Standard account, stores the account ID on the tenant.
- `createAccountLink(accountId, refreshUrl, returnUrl)`: generates the Stripe onboarding link.
- `getAccountStatus(accountId)`: checks if the account has charges enabled.

`POST /api/stripe/connect`: freelancer only. Creates connected account (if not exists), generates account link, returns onboarding URL. Frontend redirects.

`GET /api/stripe/connect/callback`: handles return from Stripe onboarding. Verifies account status. If charges enabled: marks as connected. If not: shows "connection incomplete" message with retry option.

**Payment routing update:** modify the `createCheckoutSession` function from Step 21. In managed mode: add `payment_intent_data: { application_fee_amount }` calculated from tier config, and pass `{ stripeAccount: tenant.stripeConnectedAccountId }` as the second argument to `stripe.checkout.sessions.create()`.

**Webhook update:** in managed mode, webhooks for connected accounts include an `account` field. Use this to resolve the tenant. Update the webhook handler to handle both direct (self-hosted) and connected account (managed) events.

**Tests:**

- Connected account creation stores ID on tenant.
- Account link generation returns valid URL.
- Payment with platform fee: fee calculated correctly from tier config.
- Webhook handles connected account events.

**Acceptance:**

- Freelancer can connect Stripe via OAuth.
- Payments route through platform with correct fee deduction.
- Webhook processes connected account events.
- All tests pass.

---

### Step 32 — Subscription Billing

**What:** Stripe Billing for Pro and Agency tier monthly subscriptions.

**Files:**

```
src/lib/stripe/billing.ts
src/app/api/billing/subscribe/route.ts
src/app/api/billing/portal/route.ts
src/app/api/webhooks/stripe/route.ts     (extend existing)
```

**Detail:**

`billing.ts`:
- `createSubscription(tenantId, tier)`: creates Stripe customer (if not exists), creates subscription with the tier's price ID. Updates tenant: `subscription_stripe_id`, `subscription_tier`, `subscription_status: 'active'`.
- `cancelSubscription(tenantId)`: cancels at period end. Updates status.
- `getSubscriptionStatus(tenantId)`: returns current tier and status.

`POST /api/billing/subscribe`: freelancer only. Body: `{ tier: 'pro' | 'agency' }`. Creates or updates subscription. Returns confirmation.

`POST /api/billing/portal`: freelancer only. Creates Stripe Billing Portal session. Returns URL. Frontend redirects — allows managing payment method, viewing invoices.

**Webhook extension:** add handlers for:
- `invoice.paid` (subscription context): update tenant `subscription_status: 'active'`. Platform event.
- `invoice.payment_failed`: update `subscription_status: 'past_due'`. Platform event. (Note: this is a Stripe Billing invoice event, not to be confused with portal invoice payment events.)
- `customer.subscription.deleted`: update `subscription_status: 'cancelled'`, downgrade `subscription_tier: 'starter'`. Platform event.

**Downgrade behaviour:** on cancellation, tenant continues to work — just with starter limits and higher transaction fee. No data loss.

**Tests:**

- Subscription creation sets correct tier and status.
- Cancellation downgrades to starter.
- Webhook: payment_failed → past_due, deleted → cancelled + starter.

**Acceptance:**

- Freelancer can upgrade tier via subscription.
- Downgrade on cancellation works.
- Webhook lifecycle correct.
- All tests pass.

---

### Step 33 — Tier Limits & Usage Tracking

**What:** Enforce resource limits based on subscription tier.

**Files:**

```
src/lib/platform/limits.ts
src/lib/platform/usage.ts
```

**Detail:**

`limits.ts`:

```typescript
async function enforceLimit(tenantId: string, resource: 'clients' | 'projects' | 'storage' | 'emails'): Promise<void>
```

Looks up tenant tier → gets limit from TIER_CONFIG → queries current usage → throws `ForbiddenError` with upgrade message if exceeded. `null` limit means unlimited.

Wired into: `createClient` (check maxClients), `createProject` (check maxProjects), file upload (check maxStorageGB), email send (check maxEmailsPerMonth).

`usage.ts`:

- `trackStorageUsage(tenantId, bytes, operation: 'add' | 'remove')`: atomically increments/decrements `storage_used_bytes` on tenant row.
- `trackEmailSent(tenantId)`: increments `emails_sent_this_month`.
- `resetEmailCounters()`: scheduled task — checks each tenant's `emails_reset_at`, if a month has passed, resets counter and updates timestamp.
- `recalculateStorage(tenantId)`: SUM of all deliverable and attachment file_size for the tenant. Updates `storage_used_bytes`. Run by weekly scheduled task.

**Scheduled task additions:** add `resetEmailCounters` (daily) and `recalculateStorage` (weekly) to the task runner from Step 9.

**Tests:**

- Limit enforcement blocks creation when at limit.
- Limit enforcement allows creation when under limit.
- Unlimited (null) is never blocked.
- Storage tracking increments and decrements correctly.
- Email counter resets monthly.

**Acceptance:**

- Creating resources at tier limit returns 403 with upgrade message.
- Storage and email usage tracked correctly.
- Scheduled resets work.
- All tests pass.

---

### Step 34 — Managed Email

**What:** Centralised email sending with tenant branding injection.

**Files:**

```
src/lib/email/managed.ts
```

**Detail:**

`managed.ts`: extends the email service for managed mode.

`ManagedEmailService` implements `EmailService`:
- Uses the platform's Resend API key (from `platform_settings` or env var).
- From address: `portal@{platformDomain}`.
- Before rendering templates: resolves tenant branding (brand name, brand colour, logo URL, subdomain) from the tenant's settings.
- Injects tenant branding into existing email templates.
- Subject lines include tenant brand name: "Log in to {tenantBrandName}", "New invoice from {tenantBrandName}: {invoiceNumber}".
- Footer: "Powered by {platformName}".
- Calls `trackEmailSent(tenantId)` after each successful send.
- Checks email limit before sending via `enforceLimit(tenantId, 'emails')`.

Update the email factory (`src/lib/email/index.ts`): in managed mode, return `ManagedEmailService`. In self-hosted mode, return existing `ResendEmailService` or `NoopEmailService`.

**Tests:**

- Managed email service injects tenant branding correctly.
- Email counter incremented after send.
- Email blocked when at limit.
- Subject lines contain tenant brand name.

**Acceptance:**

- Emails sent from managed platform include correct tenant branding.
- Email limits enforced.
- Counter tracks correctly.
- All tests pass.

---

### Step 35 — Admin Dashboard

**What:** Platform management interface for the admin role.

**Files:**

```
src/app/(admin)/layout.tsx
src/app/(admin)/page.tsx
src/app/(admin)/tenants/page.tsx
src/app/(admin)/tenants/[id]/page.tsx
src/app/api/admin/overview/route.ts
src/app/api/admin/tenants/route.ts
src/app/api/admin/tenants/[id]/route.ts
src/lib/platform/admin-queries.ts
```

**Detail:**

**Auth gating:** admin routes require `userType: 'admin'`. Admin layout checks auth context and redirects non-admins.

**API:**

`GET /api/admin/overview`: returns platform stats — total tenants, MRR (sum of active subscription fees from TIER_CONFIG × count per tier), transaction fees this month (sum from platform_events where type = 'payment.fee_collected'), total revenue, active tenants (logged in within 30 days), system health (from health check logic).

`GET /api/admin/tenants`: paginated tenant list. Columns: name, email, subdomain, tier, subscription status, signup date, last active, storage used. Search and filter by tier/status.

`GET /api/admin/tenants/:id`: tenant detail — all tenant info, usage stats (storage used vs limit, emails sent vs limit, client count vs limit, project count vs limit), revenue from tenant (total transaction fees collected, subscription payments), subscription info.

`PATCH /api/admin/tenants/:id`: admin actions — change tier (overrides subscription), suspend tenant (sets a `suspended` flag — suspended tenants' portals return a "portal suspended" page).

**UI:**

Admin overview: stat cards (total tenants with trend, MRR, transaction fees this month, total revenue, active tenants, system health card). Revenue charts: MRR by tier (stacked bar), transaction fees by month (line chart).

Tenant list: DataTable with search and filter by tier/status. Click → tenant detail.

Tenant detail: info card, usage stats with visual bars (used/limit), revenue from tenant, subscription management.

**Tests:**

- Admin endpoints return correct data.
- Non-admin users cannot access admin endpoints (403).
- Tenant management actions work (tier change, suspend).

**Acceptance:**

- Admin can view platform overview with correct stats.
- Tenant list shows all tenants with correct info.
- Tenant detail shows usage and revenue.
- Admin actions work.
- Non-admins blocked.
- All tests pass.

---

### Step 36 — Platform Testing

**What:** Comprehensive tests for all multi-tenancy and platform features.

**Files:**

```
src/__tests__/platform/tenant-isolation.test.ts
src/__tests__/platform/rls.test.ts
src/__tests__/platform/subdomain-routing.test.ts
src/__tests__/platform/stripe-connect.test.ts
src/__tests__/platform/subscriptions.test.ts
src/__tests__/platform/tier-limits.test.ts
src/__tests__/platform/admin.test.ts
```

**Detail:**

`tenant-isolation.test.ts`: create two tenants with clients and projects. Authenticate as tenant A's client → attempt to access tenant B's resources via every endpoint. Every attempt must return 404. No cross-tenant data leakage through any API path.

`rls.test.ts`: directly query the database with one tenant's session variable set → verify only that tenant's rows are returned. Set different tenant → verify isolation holds at database level.

`subdomain-routing.test.ts`: request with tenant A's subdomain → resolves tenant A. Request with unknown subdomain → 404. Request with no subdomain (platform domain) → appropriate handling.

`stripe-connect.test.ts`: mock Stripe API. Test connected account creation, OAuth flow, payment with fee calculation.

`subscriptions.test.ts`: mock Stripe Billing. Subscription creation, upgrade, downgrade, cancellation → starter, webhook lifecycle.

`tier-limits.test.ts`: set tenant to starter → create resources up to limit → verify next creation blocked → upgrade tier → verify creation allowed again.

`admin.test.ts`: admin endpoints return correct data, non-admin blocked, tenant management actions.

**Acceptance:**

- `pnpm test` with platform tests — all pass.
- Zero cross-tenant data leakage verified.
- RLS enforcement verified at database level.
- Complete Stripe Connect and Billing lifecycle tested.
- Tier limits correctly enforced and lifted on upgrade.

---

## POST-BUILD CHECKLIST

After all 36 steps are complete, verify the following before declaring the build done:

1. `pnpm lint` — zero errors.
2. `pnpm build` — production build succeeds.
3. `pnpm test` — all API and unit tests pass.
4. `pnpm test:e2e` — all Playwright flows pass.
5. `docker build .` — image builds under 200MB.
6. `docker compose up` → fresh database → visit URL → setup wizard works → first client added → first project created → first invoice sent.
7. README complete with all sections.
8. `cortex-context/` directory contains build artifacts.
9. No hardcoded product names — all branding from settings.
10. No console errors in production build.