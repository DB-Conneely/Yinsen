---
paths: ["src/app/**/route.ts", "src/lib/**", "src/server/**", "src/instrumentation.ts", "src/proxy.ts", "src/middleware.ts", "drizzle/**", "scripts/**"]
---
# Server, data and integration rules

- Derive identity from current authenticated sessions and stored client/project relationships. Caller-supplied IDs never authorize access. Preserve primary-client decision rules and indistinguishable foreign/unknown resource denial.
- Use one shared writer per project/proposal/payment/release transition. Routes, webhooks and schedules must not independently write competing domain truth.
- Enforce transactions/constraints for invoice numbering, proposal acceptance, file versions, state changes and payment/release. Replay/races cannot create duplicate projects, charges, revenue or release events.
- Use explicit reviewed migrations and real PostgreSQL constraints. Startup verifies schema but never silently migrates it. Runtime database privileges are separate from migration privileges; bound pools and use appropriate TLS on nonlocal connections.
- Keep secrets/infrastructure in server environment; setup verifies configuration, not a new credential vault. Validate required/partially configured values; optional absent services retain their documented manual/local paths.
- Session/magic links are securely stored, single-use/expiring/revocable as applicable. Cookie-authenticated writes need CSRF protection, auth endpoints need rate limits, completed setup cannot be taken over, deletion revokes access.
- Validate file size/type and stream within bounds; prevent traversal, unsafe execution and forged cross-project parents/links. Persistent files live outside ephemeral containers. S3 references cannot bypass private authorization.
- Stripe uses raw-body native signatures, actual payment/amount/currency, stable invoice correlation and deduplicated effects. Browser returns never prove payment; persistence failure is retryable, not acknowledged as success. Follow the product contract for manual settlement/release/exceptions.
- Check official provider/version docs. Resend, Stripe and S3 are narrow selected integrations; no generic plugin framework or managed-platform scaffolding.
- Structured safe logging with correlation IDs; no production `console.*`, credentials, auth tokens, raw provider errors or unnecessary personal payloads. Typed errors and the original safe API envelope cross boundaries.
- Startup/periodic expiry and overdue consumers must actually run. Scope SSE producers/subscribers and refresh authoritative state on reconnect. Document the single long-lived runtime; do not imply replicas or distributed scheduling are supported.
- Every database or integration change has real installed-path proof, focused integration/regression checks and visible failure behaviour. Missing external setup is explicit unverified work, never omitted consumers.
