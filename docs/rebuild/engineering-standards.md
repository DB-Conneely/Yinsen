# Yinsen engineering standards

Adapt BookedBy's strict engineering and installed-functionality standard to Yinsen's selected runtime. BookedBy-specific Supabase, pg-boss, voice, calendar and messaging-provider rules are not inherited. The former Cortex checklist cannot override these requirements. All roles explicitly load [quality gates](../../.codex/rules/quality-gates.md), [TypeScript](../../.codex/rules/typescript.md), [frontend](../../.codex/rules/frontend.md), [server](../../.codex/rules/server.md) and [tests](../../.codex/rules/tests.md); path headers do not replace loading them.

Verification importance is **functionality through proof > wired production code > tests and gates**. All three are mandatory. Required behaviour without actual functional proof is not verified. QA has write authority and persists through in-scope repairs to obtain truthful acceptance; it cannot manufacture VERIFIED to meet a schedule.

## Coverage and gates

| Planned path/surface | Applicable requirements |
| --- | --- |
| `src/app/**`, `src/components/**`, `src/hooks/**`, UI state | Frontend, authorization, accessibility, tests and base gates |
| `src/app/**/route.ts`, `src/lib/**`, scheduled/startup code | Server/data/integration rules, tests and base gates |
| `e2e/**`, test helpers and `**/*.test.*` | Meaningful proof, privacy and base gates; no blanket lint/type exclusions |
| Configuration, migrations, package scripts, Docker/Compose and operator docs | Actual consumer/install path, explicit migration, persistence, clean-start and recovery proof |

Before task handover/phase completion: strict typecheck covers application, tests and applicable framework types; production build succeeds; lint/format has zero warnings/errors; configured tests have zero failures; every exported/public function in the delivered rebuild has at least one meaningful test; no forbidden unfinished/suppression markers. Changed acceptance behaviours also need real-caller tests and practical proof. Phase 1 installs command mappings, including type-aware checks for floating promises and unsafe/unused code. Do not assume historical Biome configuration enforces all new rules: use the minimum supported tooling that does, recording any necessary addition. Exact dependency versions are pinned.

These gates supplement required practical proof of each changed acceptance behaviour through the installed caller. A process starting, health response, helper coverage or mocked domain outcome is not business functionality. No task or phase is accepted solely because commands are green.

## TypeScript and scope

- Strict mode includes `noImplicitReturns` and `noFallthroughCasesInSwitch`. Zero `any`; narrow `unknown`. Explicit public/exported returns. No floating promises.
- Use typed errors or discriminated results and stable HTTP error codes; do not throw raw string errors. Keep the original API envelope and integer smallest-unit money. Specify deterministic line-item rounding for decimal quantities and test boundary values.
- Justify unavoidable casts/non-null assertions locally; do not add blanket suppressions. Prefer discriminated state and clear ownership. Framework-required default exports are allowed; other exports are named. Do not split framework-required conventions to obey the old blanket ban.
- Split functions exceeding forty lines along genuine responsibilities. Reuse existing/native solutions; avoid speculative abstractions, barrels, providers, options and dependencies. Comments explain why.
- Implement only the agreed task and its prerequisites. Preserve validation, security, error handling, accessibility and requested journeys. Every planned addition must serve a stated deliverable; subtract extras before handing over.

## Frontend and client access

- Render server-owned project/milestone/invoice/release truth. Optimistic updates must not invent payment, acceptance or download authorization.
- Authorize every read/write/download/SSE subscription on the server using current session, resource ownership, project membership and primary-client rules. Hiding controls is not access control. Do not leak another client's data via notifications, attachments, aggregates or caches.
- Use semantic HTML, keyboard access, labels, focus handling and useful loading/empty/error states. Verify both operator and client flows on the actual supported browser/mobile layouts.
- Neels's standing visual-quality instruction, 17 October 2026: component styling and correct placement are part of functional delivery. Inspect every delivered screen in actual desktop/narrow viewports, both themes and initial/scrolled states. Navigation, header/sidebar and primary work must form a coherent usable layout; secondary context must not bury the main action. Review spacing, type/status hierarchy, message/attachment/form treatment, contrast, focus, overflow, clipping and unobscured controls. An interaction suite or DOM assertion cannot establish visual quality. Use actual viewport evidence for placement; classify full-page capture artifacts through the live viewport. Fix composition defects before acceptance.
- Use native framework routing correctly: route-group folder names are not public URL segments. Preserve the original public `/dashboard`, `/portal` and auth entrypoints with correctly mapped files. Validate navigation and deep links, not just component rendering.

## Server, data and integrations

- Keep one authoritative writer per domain transition. Validate trust boundaries with typed schemas. Use transactions/constraints for competing proposal acceptances, numbering, project transitions, payment/release and version changes; one race cannot create duplicate projects or revenue.
- Store session/magic-link state securely, enforce single use/expiry/revocation, protect cookie-based writes against CSRF, rate-limit auth and prevent setup takeover after first boot. Don't expose tokens or secret values in logs. Client deletion revokes access immediately; restoration does not revive old sessions/tokens.
- Client deliverable/version downloads require current project membership and release; the authorized operator retains download access. Message attachments use current conversation scope (general client or project) and have no payment/release gate. Public branding assets are separate from private files. Validate configured size/type and bounded streaming. Prevent traversal, unsafe content execution and cross-project parent/milestone links. Local files must persist outside ephemeral containers; S3 access cannot bypass private-file authorization through unrestricted references.
- Use explicit versioned database migrations, never automatic schema changes at application startup. Refuse an incompatible/pending schema with an actionable message. Use actual least-privilege runtime access distinct from migration privileges. Prove fresh migrations, constraints, commit/rollback and failure recovery against real PostgreSQL.
- Check current official provider/framework docs for the pinned versions. Wire server-only validated variables through `.env.example` to real consumers. Don't freeze old package versions or copy another product's provider/security topology blindly.
- Implement real signatures, idempotency, native payloads and failure contracts. Missing credentials cannot justify omitted wiring or invented success. Structured logs carry safe correlation identifiers, no raw provider errors or unnecessary personal data; no production `console.*` logging.
- Scheduled cleanup/overdue work must have an actual startup registration and installed consumption. SSE events must be scoped and update real views; after reconnect, refresh authoritative state. Document the single-process hosting boundary instead of implying horizontal reliability the design does not provide.

## Tests and practical evidence

- Mock only external boundaries that cannot be run deterministically. Owned database, authorization, HTTP routes, domain writers, file access, schedules and migrations run for real when they are the claim. Test fixtures never establish configured provider functionality.
- Install relevant API/integration/browser tests in the owning task, not in an end-of-build rescue phase. Test observable outcomes and failure invariants rather than private copies of the implementation. Fixes need the smallest meaningful root-cause regression check.
- No weakening/skipping tests, mocked Yinsen outcomes, test-only product routes, fake production modes, retry-until-pass assertions or sleeps to manufacture green results. Await actual completion/events and control time at the external boundary where appropriate.
- Exercise ordinary development and built production paths where their behaviour differs; final QA rehearses the delivered installation. Record source/configuration, actual caller, commands, persisted/provider facts and visible result. Recheck affected evidence after repairs.
- A forbidden-marker `rg` scan passes only with no matches/exit 1; matches or scan errors fail. Ordinary type/build/lint/test commands must exit zero. Do not mistake scan conventions for a general permission to ignore command failures.

## Documentation is part of the product

Every operational/configuration claim points to an implemented command or consumer and a demonstrated result. Phase 1 starts real first-run instructions; owning tasks extend them. Final operator docs cover no-provider installation, configured optional providers, customisation, volumes/secrets, explicit migrations, logs/troubleshooting, update/rollback limits and database-plus-files backup/restore. A fresh reader must be able to reproduce the documented path.

Publish no real secrets, contact fixtures, internal logs or unsupported functionality claims. Do not add SaaS screens or dormant configuration for hypothetical future distribution. Build and local rehearsal do not authorize deployment; Neels controls GitHub CI/CD deployment manually.
