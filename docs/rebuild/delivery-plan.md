# Yinsen rebuild delivery plan

Five sequential phases; fourteen tasks; one fresh implementor per task; one orchestrator per phase. **Plan and protocol locked on 15 October 2026; implementation is not started or authorized.** Read the [contract](product-contract.md), [process](delivery-process.md), [standards](engineering-standards.md) and all [rule files](../../.codex/rules/) first. The hierarchy is Phase -> Task; each task is already a bounded group of related steps.

Task touchpoints below are planned ownership, not findings about current source. At authorised phase launch the orchestrator binds them to exact files in this `yinsen` repository, reads the actual framework version/callers and confirms predecessors/resources. Public URLs are separate from Next route-group folders. Never infer current implementation from these paths or reopen locked scope as a routine launch step.

## Sequence and dispatch

| Phase | Accepted outcome | Tasks, in order |
| --- | --- | --- |
| 1 | A working self-hosted installation with operator and client access | 1.1 foundation; 1.2 setup/operator; 1.3 clients/client access |
| 2 | Both parties can agree and communicate about usable project work | 2.1 projects/milestones/lock-in; 2.2 messages/attachments; 2.3 proposals |
| 3 | Work can be delivered, invoiced and released through real payment paths | 3.1 deliverables; 3.2 invoices/manual settlement; 3.3 direct Stripe |
| 4 | The original project lifecycle, management views and customisation are complete | 4.1 completion/disputes; 4.2 dashboard/analytics; 4.3 full settings |
| 5 | Another operator can install, configure, operate and recover the open-source product | 5.1 reproducible distribution; 5.2 operations/open-source handoff |

Start each task after its preceding handover establishes required inputs; launch each phase under Neels's execution authority and predecessor QA acceptance. Judge verification in the importance order functional proof > wired production code > tests/gates; all are required with configuration and concise handover. Development and testing remain iterative. At phase end spawn **X parallel auditors, one per task**, then **X communicating patchers, one per report**, then fresh write-capable QA. X=3 in Phases 1-4 and X=2 in Phase 5. This is one wrap per phase; no separate two-auditor/two-patcher or per-task full lifecycle. Phase 5 QA owns final whole-product acceptance.

## Phase 1 - Installation and identities

### Task 1.1 - Runnable self-hosted foundation

- **Own:** package/version/strict gate configuration, first real application entry, PostgreSQL access, explicit migration/status commands, startup schema guard, validated environment, typed errors, safe logging/security headers, real DB-backed health, container/source-start instructions. Introduce schema through its actual first consumer, not an entire speculative SaaS schema.
- **Touchpoints:** `package.json`/lockfile, compiler/lint/test/build configuration, `.env.example`, Docker/Compose, `src/app` entry/health, `src/lib/db`, startup/config/error/logging boundaries, initial migration and operator quickstart. The chosen runtime and migration privileges are distinct and documented.
- **Prove:** clean dependency install -> empty real PostgreSQL -> explicit migration/status/rerun -> ordinary dev and built production runtime; query the installed schema; configured health -> database loss -> failure -> recovery; pending migration/invalid required configuration refuses the appropriate readiness/startup claim. Infrastructure proof covers this task only, not portal business acceptance.
- **Handover:** exact versions, commands, paths, schema/privilege boundary and minimal first-run guide. Operator/session schema and business behaviour belong to 1.2. No old-code functionality claim.

### Task 1.2 - First boot and operator access

- **Own:** setup wizard/API, sole operator/settings, password/session auth, protected operator shell, branded landing/auth/client shells, initial business defaults. Setup verifies environment-owned integrations without persisting provider secrets. Add storage now only if a supported logo control consumes it; otherwise the logo control arrives in 4.3.
- **Touchpoints:** public `/`, `/setup`, `/login`, protected `/dashboard`, client auth shell; onboarding/auth/layout components; `src/lib/auth`, setup/settings/config writers and migrations; actual cookie/server authorization. Navigation lists delivered pages only.
- **Prove:** empty database -> setup -> persisted operator/defaults -> authenticated dashboard; second/competing setup denied; login/logout, wrong password, expiration/revocation and protected deep-link/API denial; brand name/colour/currency persist across restart and appear on built surfaces. No-provider boot is useful, not an error. Test security headers/CSRF/rate limits through actual boundaries.
- **Handover:** one-operator invariant, established session/configuration contract and runnable setup. Placeholder shells are not claims of unbuilt feature acceptance.

### Task 1.3 - Clients and client access

- **Authorised addition, 17 October 2026:** complete the professional visual treatment across all delivered Phase 1 screens and add accessible, persistent light/dark mode with an initial system preference. Task 1.3's current implementor owns the shared visual integration; the three task auditors and fresh QA review their affected surfaces. This brings the basic theme capability forward from 4.3. Prove desktop/mobile layout, both themes, keyboard operation and unchanged access/management journeys through the installed application.
- **Own:** client CRUD/search/pagination/metadata/soft delete/restore; manual magic links, optional Resend request/delivery, verification and client sessions; initial client portal; session revocation and actual startup/periodic expired-session/token cleanup. Add activity creation/query with its real client-management consumers.
- **Touchpoints:** `/dashboard/clients` and detail, `/portal/login`/verification/protected portal entry; client forms/cards, client/auth/email/activity modules, API handlers/hooks, sessions/token/client migrations and scheduler startup registration. Consume the initial configuration from 1.2.
- **Prove:** operator creates client -> generates link -> actual client login; email case/whitespace duplicate handling and restore; token expiry/single-use/replay; delete/revoke immediately denies access; two clients cannot acquire each other's identity/data, and a client cannot call operator management routes. Exercise real cleanup and configured synthetic email delivery/failure, or name the exact unavailable external check.
- **Handover:** current operator/client identities, effective authorization, tested manual/email paths and cleanup. Phase 1 QA judges installed access; it cannot certify future project/file authorization.

## Phase 2 - Agreement and communication

### Task 2.1 - Project workspace, milestones and lock-in

- **Own:** project CRUD/membership/primary client, status transitions through lock-in/active/pause/resume; usable milestone CRUD/order/status/primary approval; actual operator/client project lists/details. Install scoped SSE/activity and browser consumers with these real actions. Completion controls wait for 4.1.
- **Touchpoints:** `/dashboard/projects`, `/portal/projects` and detail; project/milestone domain writers/queries/validators, membership/milestone migrations, API routes/hooks/cards, activity and SSE connection/auth/event consumers.
- **Prove:** operator creates project with primary/member clients and milestones -> sends lock-in -> eligible client agrees -> active; pause/resume and milestone reorder/review/approval persist. Primary approval succeeds; secondary/unrelated/anonymous actions and invalid transitions fail. Real authorized browser receives a change; unrelated client receives no data; reconnect refreshes current truth. Deep links and membership removal recheck access.
- **Handover:** usable project/milestone writers and their invariants for proposals and later files. Milestone UI is working now, not a deferred helper.

### Task 2.2 - Messages and attachments

- **Own:** general client-level and project-level messaging, attachment streaming/access, actual thread/composer views, unread/read state, scoped notifications and SSE updates. Introduce local/S3 consumers needed for attachments, with private storage and useful failure states.
- **Touchpoints:** `/dashboard/clients/:id` conversation, operator/client project threads, `/portal/messages`; message/attachment schema, storage/email-independent messaging modules, endpoints/hooks/UI and existing event/activity consumers.
- **Prove:** operator and client exchange messages/files through both conversation levels -> persisted thread/read state -> correct browser update without reload; refresh/reconnect recovers missed state. Another client cannot fetch the conversation, attachment or SSE event. Test upload size/type/path validation, real bytes, client scope, read/unread lifecycle and storage failure. Configured cloud storage is exercised here or carried explicitly to 3.1's owner.
- **Handover:** installed general/project message writers, private attachment path, notifications and cloud-proof status. No fabricated live-chat success from a mocked store.

### Task 2.3 - Proposals and negotiated project creation

- **Own:** send/counter/reject/accept proposal cards and transitions, current proposal-chain authority and atomic project/milestone creation through 2.1's existing writers.
- **Touchpoints:** general message threads/cards/counter modal, proposal validators/writer, transaction/uniqueness constraints, actual message endpoints/hooks, existing project/milestone/activity/SSE consumers.
- **Prove:** operator proposes -> client counters -> eligible recipient accepts latest version -> exactly one usable **active** project with agreed budget/currency/milestones. Proposal acceptance is the mutual agreement and does not require a second lock-in; manually created projects retain lock-in. Replayed/competing accepts, obsolete counters and wrong-party actions cannot create duplicates or alter accepted terms. Rejection leaves no project.
- **Handover:** accepted-proposal/project identity, active-state exception to manual lock-in and proven transaction/rollback. Do not implement a second project writer.

## Phase 3 - Files, invoices and payment

### Task 3.1 - Versioned deliverables and private release

- **Own:** milestone uploads, parent/version history, local and configured S3-compatible file consumers, current download authorization, explicit release/relock and actual operator/client file views.
- **Touchpoints:** project/milestone file components, deliverable schema/writers/validators, `src/lib/storage` adapters, upload/download APIs, hooks/activity/SSE; deployment volume/storage reference docs. Reuse the already installed attachment storage boundary.
- **Prove:** upload -> correct bytes persist -> anonymous/foreign/unreleased version denied -> operator releases -> eligible client downloads actual bytes -> manual relock denies again. New versions start unreleased; forged parents/milestones are denied. Restart preserves local data; configured S3 follows the same authorization and byte checks, including attachments and existing logo if present. Test bounded uploads and storage failures.
- **Handover:** exact supported storage/configuration modes and current release controls for invoicing. No payment logic yet; manual release is the complete usable feature.

### Task 3.2 - Invoices, manual settlement and release triggers

- **Own:** invoice CRUD/line-item math/total override/numbering, actual operator and portal invoice pages, send with configured email or manual portal sharing, frozen financial terms, invoice-milestone triggers, full manual settlement and shared terminal-payment/release writer. Install real overdue startup/periodic task and views.
- **Touchpoints:** `/dashboard/invoices` list/new/detail, `/portal/invoices` list/detail; invoice forms/line editor/preview/settlement controls, invoice/item/link/counter migrations, auth/queries/writers/hooks, email templates, events/analytics source facts and scheduler registration.
- **Prove:** concurrent creation produces unique immutable numbers -> send -> client's actual invoice view -> full manual settlement -> linked versions released/downloadable; wrong amount/recipient/project association denied; no-links causes no release. Demonstrate the preserved any-linked-paid rule, new uploads unreleased, manual relock and replay no-op. Sent financial edits denied; paid/settled deletion and milestone deletion denied; overdue job persists and updates real UI. Configured email failure leaves draft and honest retry. No-provider manual workflow completes.
- **Handover:** frozen invoice and idempotent terminal transition used by 3.3, rounding/numbering rules, original release semantics visible in UI and docs, email/overdue proof. Do not mark an invoice feature complete while its pages remain placeholders.

### Task 3.3 - Direct Stripe payment

- **Own:** Pay action/on-demand idempotent Checkout, immutable invoice/session correlation, signed webhook, deduplication/payment-state checks, cancellation/settlement races and visible exceptions. Use 3.2's existing terminal writer and file-release semantics; no Connect or platform fees.
- **Touchpoints:** client Pay control/payment API, `src/lib/stripe`, invoice/payment event/session persistence, raw-body webhook route, operator invoice payment-exception view, existing release/activity/SSE paths, `.env.example` and direct-Stripe operator instructions.
- **Prove:** configured real non-production Checkout -> actual signed provider event -> correct persisted paid invoice -> released client download and visible update. Deny forged signature/wrong amount/currency; duplicate/out-of-order/old-session events cannot double revenue or re-release; abandoned/failed/unpaid checkout grants nothing; return-page visits grant nothing. Competing Pay requests, provider timeout/retry, cancel/manual-settle races and late extra payments have the contract's explicit outcomes. Exercise actual retry after a controlled owned persistence failure. Synthetic payload tests supplement, not replace, the configured provider path.
- **Handover:** exact provider/API/SDK versions, event/config contracts, real payment and failure evidence, any named missing external resource. Stripe absence cannot break manual invoicing or justify unwired payment code. Phase 3 does not receive VERIFIED Stripe acceptance without its real non-production exercise.

## Phase 4 - Lifecycle, management and customisation

### Task 4.1 - Completion, disputes and archive

- **Own:** submit-for-approval, primary-client accept/dispute, reason in the actual message thread, resubmission/completion/archive, activity/SSE and state-appropriate controls.
- **Touchpoints:** project/completion views and endpoints, existing state/primary-client writer, message/activity/event consumers and client/operator notifications.
- **Prove:** submit -> client disputes with valid reason -> both see stored reason -> resubmit -> primary client accepts -> completed -> operator archives. Wrong roles/secondary clients, stale competing actions, repeat submits and invalid transitions preserve coherent state. Existing file/payment access remains correct after completion/archive.
- **Handover:** complete original project lifecycle and persisted/visible dispute history, with affected project/invoice/file paths re-exercised.

### Task 4.2 - Dashboard and analytics

- **Own:** actual operator overview/needs-attention actions/recent activity, revenue/project/client aggregates, charts, period filters and working navigation, using existing authoritative records.
- **Touchpoints:** `/dashboard`, `/dashboard/analytics`, analytics queries/endpoints/hooks/charts, existing activity and notifications; no separate reporting store or invented pipeline truth.
- **Prove:** create representative data through delivered journeys; compare dashboard/chart totals against actual paid/settled/unpaid/project/client facts; repeated payments/exceptions cannot inflate revenue; empty/period boundaries and per-record currencies are handled honestly. Mixed currencies are shown separately, never silently added or converted. Cards navigate to real resources; relevant state changes update actual views; clients cannot read operator aggregates.
- **Handover:** aggregate definitions, currency/filter/attention semantics and observed end-to-end results. No new finance/accounting product.

### Task 4.3 - Full settings and customisation

- **Own:** complete branding/logo/contact/profile, welcome copy, invoicing defaults/instructions, account/password/session UI and light/dark/system preferences. Extend operative setup/security controls from Phase 1; do not postpone their essential protection until now.
- **Touchpoints:** `/dashboard/settings`, settings/account/session APIs/writers/hooks/forms/theme, logo storage, landing/client/operator/email/invoice consumers and configuration guide. All invoice counter/identity changes follow the product contract.
- **Prove:** save settings -> persisted values affect real consumers immediately or with documented restart; no hardcoded brand/default-currency override of existing records. Password change/revoke invalidates real sessions; client restore does not revive old tokens. Logo upload/replacement/removal and actual theme/browser/error/loading/accessibility states work. Changing integration environment is documented and verified without leaking secrets or creating a credential editor.
- **Handover:** complete configuration-to-consumer inventory and preserved historical invoices/identities. Phase 4 QA confirms the self-hosted feature surface is complete.

## Phase 5 - Distribution and operations

### Task 5.1 - Reproducible installation package

- **Own:** finalize Docker/source startup, persistent volumes, example configuration/reference, quickstart, provider guides and customisation instructions, extending docs maintained since 1.1. Establish a truthful supported-mode matrix and required/optional configuration with defaults, validation and restart behaviour. No one-click hosting matrix or agent deployment.
- **Touchpoints:** README/operator/contributor docs, `.env.example`, package/migration/start commands, Docker/Compose/volume definitions, existing setup and configured providers. Any packaging changes must reach the same installed application.
- **Prove:** use a fresh isolated installation and follow committed instructions verbatim -> real PostgreSQL/schema -> ordinary production-built app -> setup -> operator/client login -> manual invoice/file journey with zero providers. Demonstrate persistence after ordinary restart. Rehearse configured Stripe/Resend/S3 instructions against selected non-production resources, carrying source-valid prior provider proof where unchanged. A missing supported-option check stays visible and cannot be hidden by a green core setup.
- **Handover:** reproducible instructions, supported runtime/versions/limits, real command results and resource requirements. Optional paid installation uses this same guide without new app code.

### Task 5.2 - Recovery and open-source handoff

- **Own:** database-plus-uploads backup/restore procedure, supported update/restart/explicit-migration/rollback limits, configuration changes, logs/troubleshooting, MIT licensing/contribution/support documentation, actual screenshots and accurate final feature claims. Remove only unused rebuild artifacts within authorized scope; preserve legacy/history/recovery paths.
- **Touchpoints:** operator/README/license/contributor docs, real backup/restore commands or minimal scripts if necessary, persisted database/file stores and installed startup/migration path. No scheduler or backup service is needed for the documented manual operation.
- **Prove:** populate synthetic app through real journeys -> consistent DB/file backup -> restore into isolated copy -> operator/client access and correct historical files/releases/invoices/messages. Keep external effects disabled during restored-copy rehearsal. Exercise update/restart/status with the actual delivered migration set; do not invent a past release or schema migration to claim upgrade compatibility. Document untested future-version compatibility and rollback limits honestly.
- **Handover:** runnable, documented recovery/operation and accurate open-source package. A fresh Phase 5 QA then owns the final whole-product verdict; this task is not a substitute QA pass or publishing/deployment authorization.

## Original-plan coverage

Original reference: [preserved Steps 1-36](../legacy/implementation-original.md), extracted from `75f2ab9a6ef1ebba8d3ac492e9280c8343907044:cortex-context/implementation.md` in the old repository. Preserve its product detail; regroup work around actual consumers.

| Original steps | New owner |
| --- | --- |
| 1 scaffold, 2 schema/migrations, 3 infrastructure | 1.1; each feature owner extends schema/config only as consumed |
| 4 storage | 1.2 if logo is included; 2.2 attachments; 3.1 deliverables; 4.3 logo completion; 5.1/5.2 operations |
| 5 email | 1.3 access; 3.2 invoices; 4.3 brand propagation |
| 6 auth | 1.2/1.3; every feature's permissions; 4.3 account/session UI |
| 7 SSE, 8 activity | 1.3 first activity; 2.1 first actual SSE; each feature extends owned consumers; 4.2 presentation |
| 9 scheduled tasks | 1.3 expiry/token cleanup; 3.2 overdue; actual startup/periodic consumers owned immediately |
| 10 onboarding, 11 auth pages, 12 shells/landing | 1.2/1.3; navigation grows with delivered pages |
| 13 shared UI | First actual feature owner; no speculative component-library task |
| 14 clients | 1.3 |
| 15 projects, 16 lock-in | 2.1 |
| 17 milestones/deliverables | 2.1 usable milestones; 3.1 files/version/release |
| 18 messages, 19 proposals | 2.2, then 2.3 |
| 20 invoices, 21 Stripe webhook | 3.2, then 3.3 |
| 22 completion | 4.1 |
| 23 dashboard, 24 analytics | 4.2 |
| 25 settings | Initial consumed configuration/security in 1.2/1.3; full controls in 4.3 |
| 26 API tests, 27 E2E | Relevant tests in every owning task immediately; each phase QA checks accepted cumulative journeys |
| 28 polish/docs | Useful docs from 1.1 onward; accessibility/responsive states per feature; 5.1/5.2 finish distribution/operations |
| 29-36 managed SaaS/platform tests | Historical only; no replacement tasks or dormant scaffolding |
| Later remediation 37-46 | Historical repair work, not a second rebuild backlog; its relevant proof requirements are already assigned above |

## Final acceptance and stop

Final QA independently follows the installed public guide, runs gates and proves both operator/client journeys: setup/access -> project/milestones/lock-in -> messages/proposal acceptance -> files -> manual and configured Stripe invoice/release -> dispute/resubmit/completion/archive -> truthful dashboard/settings. Inspect actual persisted facts and denial/replay/failure cases, not test counts alone. Rehearse backup/restore, restart persistence and supported provider configuration using the final source or explicitly valid inherited evidence.

The complete product is finite: fourteen task outcomes, five independent phase verdicts, required supported paths exercised, no open in-scope functional defects or false completion claims. Future team features, SaaS, extra providers, tax/refunds/partial-payment systems and aesthetic expansion are separate requests. Finish this scope and stop; do not generate an indefinite hardening backlog.
