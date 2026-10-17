# Phase 2 Task 2.3 audit — proposals and negotiated creation

17 October 2026. Independent report-only auditor `/root/audit_23_remote`.
**Two actionable defects: A23-01 medium, A23-02 low.** This report is an input
to the dedicated fresh patch agent and fresh QA; it grants no phase acceptance.

## Candidate, environment and boundaries

- Phase start: `bbb3cc8283ac350c42e568e9f7896e470ef41dc4`. Frozen candidate:
  local `main` at `dfe68e0c9fb7b4de1cab8794d703259b964f0d7e`.
- Independently rehashed all **159 source files**, source SHA-256
  `0b7f97aadfb2280f1245b08219882cefdffa75acca91680ac2d8a27d1a8c7101`,
  **204 evidence artifacts, four task records and seven map artifacts**: no
  mismatches. Source build `IxW8d75JJymt2xRpT5TEX`.
- Execution: `abyssbox`, `/home/neels/development/yinsen`, Node **22.21.1**,
  npm **10.9.4**. Actual inspected running container
  `yinsen-phase23-r2-20261017`, ID
  `9530153d2d17a75db08ce26597fab67211d022f9e644b79ddcc3975071ece941`,
  app image
  `sha256:9e7599f48ac2d88ea19c4817cd719ea392ba6bc54aaa769f191487e45c4e8890`,
  image build `XGfN3bvEpPh4AoyLfruEu`, user `node`/UID 1000. Tests operated
  `http://localhost:3026` and guarded synthetic database
  `yinsen_test_phase23_container_20261017` on loopback 55434.
- Root private environment still hashes to
  `9daae8feff9ae482f95955c0b92e0efb2757ce5513d9e48729184cbe9b786965`,
  mode 0600. No supplied configuration correction or external prerequisite
  problem occurred. Secret values and session credentials are absent here.
- Loaded AGENTS, README, handover, every active rebuild document, all five
  rules, audit role, skills protocol and all four local skills; current
  system/Phase 2/gate records, predecessor Phase 1 QA/lessons, preserved Step 19
  product detail and installed Next route-handler/router/cookie guidance.
  Graphify's local affected query confirms the manual/proposal callers of
  `writeProject`; direct source inspection establishes the actual path.
  Maps remain navigation aids with their recorded SQL/JSON/cache limits.

Only this report and `.local/audit-phase02-task23/` were written. Shared runtime
operations used an explicit exclusive lease after the other auditors finished.
Fresh task-owned clients/cases preserve predecessor proof records. Canonical
3000/55432, other services, data, containers, images, volumes, source,
configuration and Git state were not mutated. No migration, grant change,
build, live email, provider write, deployment or legacy-code audit occurred.

## Independently observed functionality and production wiring

Private reproducible scripts and receipts:
`.local/audit-phase02-task23/{identity,runtime,date-probe,finish}.{mjs,json}`.
Screenshots are `filtered-send.png`, `filtered-client-send.png`,
`agreed-operator.png` and `agreed-mobile-dark.png` in that directory. The
registered Playwright connection rendered the real 3026 login and reported
Linux Chromium 154; native task-owned Playwright then supplied isolated
authenticated operator/client contexts and SQL comparisons. Initial attempts
to inspect the registered tool's Node host failed because its evaluation VM
exposes neither `require` nor dynamic imports; these were harness limitations.
The native harness explicitly asserts host, cwd, database target and browser
origin/Linux identity.

| Exercised installed path                                                      | Observed outcome                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client-initiated proposal → operator counter → client acceptance              | Exact agreed name, description, EUR 25321 minor units, active project, sole correct primary, ordered milestone names/descriptions/dates and immutable snapshot matched real SQL.                                                                                                                              |
| Browser operator proposal → fully edited client counter → operator acceptance | Full prefill, all term edits and milestone removal/addition worked. Rendered cards and the actual client project link showed EUR 253.21 and the exact active project without another lock-in.                                                                                                                 |
| Current authority and isolation                                               | Own-party response 403; obsolete version 409; foreign/unknown conversation envelopes identical 404; foreign project 404; anonymous 401; project-thread proposal 400; forged extra actor field 400; wrong origin 403.                                                                                          |
| Replay and races                                                              | Same accepted action returns success with one project/terminal and unchanged activity. Changed payload/type under an existing ID conflicts. Four concurrent accept/accept/counter/reject requests returned one 200 and three 409 with one successor and at most one project.                                  |
| Rejection                                                                     | Reverse-direction rejection commits terminal state and creates no project.                                                                                                                                                                                                                                    |
| Browser failure/retry and live update                                         | A real counter POST committed successfully, but the browser transport deliberately dropped its response. The modal retained edited terms and its ID; retry recovered the existing counter once. Incoming real multipart messages/SSE refresh preserved the open edited counter.                               |
| Accessibility and rendering                                                   | New-proposal and acceptance Escape cancellation restored trigger focus; semantic dialogs/forms remained operable. Accepted card states disabled historical actions, and the link reached the real project. Actual 390-pixel dark project rendering had no horizontal overflow; normal page errors were empty. |
| Installed SQL boundary                                                        | Runtime user `yinsen_runtime` has no superuser/create-role/create-database/schema-create privilege. Actual shape/FK/unique constraints, successor/terminal indexes, accepted-project uniqueness and agreement-preservation trigger match migration 0005.                                                      |

Fresh exact project examples are `e057693f-6700-4e4a-b660-0fe1d2616344` and
`8121b2d4-2e2f-4077-b2d4-a08d994ff310`; task-owned primary is
`a89f45dc-797a-46b0-8daf-d8b6c0067273`. Ordinary HTTP/UI created these facts;
no test route or direct domain-helper substitute was used.

The source trace is the installed general-conversation pages → `MessageThread`
→ existing client-message GET/POST route → `sendMessageResponse` → strict JSON
`actOnProposal` → one `getSql().begin`, `conversationAccess(...,"update")`,
latest-recipient authority, then the **existing** `writeProject`,
`writeMilestone` and `writeMessage` cores. Message/activity/project/membership/
milestone writes share that transaction; publication follows confirmed commit
and confirmed retry. Queries derive authoritative chain state independently of
the visible page/filter. There is no second project or milestone writer.

Manual `saveProject`/`createMilestone` still consume the same extracted cores;
manual status transitions retain their lock-in path. Current source-bound
manual UI/HTTP and milestone-primary proofs were inspected, and Task 2.1's
fresh cumulative audit owns the separate stale-decision/form findings. Shared
writer repairs must preserve the proposal transaction/snapshot contract.

## A23-01 — Medium / P2 — persisted proposal dates can be impossible to accept

**PROBLEM.** The installed JSON proposal boundary accepts a milestone date that
PostgreSQL cannot store. On 3026, an ordinary operator POST containing
`milestones: [{ name: "Date boundary", description: "PostgreSQL must accept validated terms", dueDate: "0000-01-01" }]`
with otherwise valid GBP 100-minor-unit terms returned **200** and persisted the
proposal. The current recipient's acceptance returned **503
DATABASE_UNAVAILABLE**. Retrying the identical action returned 503 again.
The database was available: a separate read-only cast of that exact date
returned PostgreSQL **22008**, while ordinary operations and rejection worked.

Project, membership, milestone and project-activity counts remained unchanged;
there was no created project or acceptance terminal. This confirms sound
rollback but leaves a successfully sent proposal impossible to accept as
written, with a misleading database-service recovery message. Rejection or a
valid counter is required. This is an actual validation/domain mismatch, not
an unavailable database or missing external resource. Reproduction used the
ordinary JSON API; no claim is made that the native browser date input permits
typing year zero.

Evidence: `date-probe.json`, `finish.json`; persisted proposal
`12f5fc64-5ffd-4a92-a104-8da0812f2dcd` in the task-owned conversation. The case
was ended through ordinary recipient rejection after proving repeated failure.

**PROPOSED SOLUTION.** The smallest correction appears to be a shared
application-date validator that rejects year zero before proposal persistence,
while preserving valid four-digit dates and nullable/omitted semantics.
`proposalTerms` should continue consuming that common milestone validator;
acceptance should retain its single atomic transaction. Existing pending
invalid terms should yield actionable validation/counter guidance when read or
acted upon rather than an infrastructure failure. Add a focused boundary
regression proving invalid-date proposal/counter submission is rejected before
storage and valid boundary dates remain usable through real acceptance.

**TOUCHPOINTS.** Shared root
`src/lib/projects/validation.ts:10` (`date`, `projectFields`, `projectPatch`,
`milestoneFields`, `milestonePatch`); consumer
`src/lib/messages/proposal-validators.ts:10` (`proposalTerms`);
`src/lib/messages/proposal-actions.ts:109` (`persistAction`);
`src/lib/milestones/service.ts` (`writeMilestone` DATE binding);
`src/lib/messages/queries.ts` (stored-term parsing), proposal editor and
ordinary message POST callers. Regressions belong alongside
`tests/proposals.test.ts`, `tests/proposals-http.ts` and affected project/
milestone validation cases. Task 2.1's auditor was notified: its report does not
duplicate this finding. One patcher must own the shared validation file and
coordinate affected manual project/milestone callers with the A21 patch owner.

## A23-02 — Low / P3 — sending from a filtered thread hides the confirmed result

**PROBLEM.** On both real general-thread screens, submit an unrelated search
such as `needle-only-a23`, then open **Propose a project** and send a differently
named valid proposal. POST returns **200**, the modal closes and the row is
persisted, but the thread remains **No matching messages** with zero new
proposal cards. The client portal provides no sent acknowledgment or way to
reach the sent terms from that result. Clearing the search manually reveals
the card. The operator's generic activity label partially indicates a send,
but likewise offers no sent card/terms in the filtered thread.

`MessageThread.proposalAction` discards the authoritative returned page for
display and calls `load()` with the existing search. Its caller then closes the
editor. This differs from the delivered ordinary composer success path, which
resets the search and installs the returned page. Data is intact; this is a
bounded outcome/feedback defect, not authorization or transaction failure.

Evidence: `runtime.json.filteredSend`, `finish.json.clientFilteredSend` and
both filtered screenshots. The client reproduction persisted message
`ffc859f6-c187-4e23-8d57-f17729f07807`; modal closed, card count zero, rendered
body retained **No matching messages** without a success notice.

**PROPOSED SOLUTION.** Reuse the thread's existing authoritative send-success
behavior for a confirmed proposal/counter, coherently updating the search
control/page/history, or retain the search while giving an explicit persisted
success notice with a clear way to view the sent terms. Preserve draft retention
and same-request-ID recovery on failure. A focused installed-browser check
should send from a nonmatching filter and observe a clear confirmed result;
there is no need for a new notification framework.

**TOUCHPOINTS.** `src/components/message-thread.tsx` (`proposalAction`, `load`,
`sent`, search state/control and new-proposal callback);
`src/components/proposal-editor.tsx` (`submit` success) and
`src/components/proposal-card.tsx` (counter success callback); installed
operator client detail and `/portal/messages`. This is a shared Task 2.2 UI
file. The A22 auditor acknowledged this proposal-caller ownership and found
no separate ordinary multipart search/generation defect. Coordinate one edit
owner rather than independently changing the same state logic.

## Engineering evidence, limits and handoff

Inspected source-bound `check-money.log`: strict generated/application/test
types, type-aware lint with zero warnings, formatting, **92 tests / eleven
files / no skips**, markers and standalone production build passed. Proposal
and money tests exercise real PostgreSQL writers/constraints, strict terms,
authorization, replay, races and rollback; installed proposal HTTP tests use
ordinary endpoints. Their existing cases omit year-zero dates and filtered
proposal success, as the reproduced findings demonstrate.

Full gates/builds and permission-changing suites were not mechanically rerun
against a shared frozen fixture. Their matching recorded artifacts were
reviewed; this audit supplied the independent browser/HTTP/SQL probes above.
Retained, source-bound implementor evidence separately proves real milestone
INSERT denial/rollback/retry, actual lost PostgreSQL COMMIT acknowledgment and
retry invalidation, source restart/reconnect with 55 missed messages and edited
drafts, manual lock-in/primary approval, current-image replacement persistence
and actual local/R2 attachment bytes/failure cleanup. These are inherited
observations, not relabelled fresh audit operations. Task 2.2 independently
operated the cumulative attachment/read/search paths and owns their audit.
Unchanged Phase 1 email/scheduler facts remain inherited; no extra live send
or elapsed-hour claim is made. Other S3 vendors, public deployment/TLS and
arbitrary load are outside this proof.

The two findings are product defects; no unavailable external resource is
identified. No additional actionable proposal atomicity, authorization,
idempotency or wiring defect was found in the exercised scope. All browser
contexts and SQL clients are closed, scripts exited zero, and the exclusive
runtime/heavy/browser lease was explicitly returned to the orchestrator.
Source and configuration remain frozen. Dedicated fresh patch ownership,
coordinated shared edits and fresh QA repair/re-exercise remain outstanding;
**fresh QA alone owns the Phase 2 verdict**.

## Patch dispositions — 17 October 2026

Fresh report owner `/root/patch_23_remote` independently reproduced both
findings, assessed their actual callers and completed the following repairs.
The original audit above is preserved verbatim. This disposition is not a
phase verdict; fresh QA owns acceptance.

### A23-01 — repaired: strict writes with readable historical terms

The shared PostgreSQL-compatible date boundary now accepts four-digit years
0001–9999 and preserves nullable/omitted semantics. A21 was the sole writer of
`src/lib/projects/validation.ts`, after direct agreement with A23; actual
manual project/milestone and proposal consumers use that boundary. Its manual
boundary proof is `.local/patch-phase02-task21/date-proof.json`.

A23 owns `src/lib/messages/proposal-validators.ts`, `queries.ts` and
`proposal-actions.ts`. New proposal/counter writes remain strict.
`storedProposalTerms` retains the same structural, amount and size limits but
allows the previously accepted historical date domain; both server message
rows and the client `proposalView` consume it. An old invalid date therefore
does not make the entire conversation unreadable. Acceptance validates the
stored terms strictly inside the existing locked transaction and returns
**400 PROPOSAL_TERMS_INVALID** with guidance to counter using valid dates or
reject. It creates neither a partial project nor a terminal message. Shared
project/milestone writers, authority, chain checks, immutable history and
atomicity remain consumed by the installed route.

Fresh ordinary requests against preserved old image 3026 created genuine
historical JSON-object proposals and reproduced send200/accept503/retry503.
The final patched 3027 route rejected new invalid proposal/counter dates before
persistence; repeated historical acceptance returned actionable400 with SQL
counts unchanged. The real client UI rendered the old cards, showed the
bounded acceptance error, preserved counter prefill, accepted a corrected
0001-dated counter into an active project with exact stored terms, and rejected
the second old proposal. Original terms remained unchanged. Final installed
`test:proposals` additionally passed valid 0001/9999/null boundaries and
historical read/counter/reject recovery. Evidence:
`.local/patch-phase02-task23/baseline-3.json`, `runtime-accepted.json` and
`http-proposals-final.{json,log}`.

### A23-02 — repaired: confirmed results, focus and stable retry feedback

A23 is the sole writer of `src/components/message-thread.tsx` and
`proposal-card.tsx`; A22 directly acknowledged the shared messaging contract
and reviewed compatibility. Confirmed proposal actions install the returned
authoritative page, clear the actual search control/state and invalidate older
GET generations. Ordinary composer text/files remain mounted and retained;
failed proposal requests retain their filter, edited terms and action UUID.
Cancel/Escape still restore the original trigger.

Success callbacks pass the exact confirmed UUID. A parent layout effect acts
after the message page and closed dialog commit, focuses that article and
scrolls its heading into view. Each intent is consumed once, so later SSE
updates do not steal the ordinary composer cursor. Proposal success suppresses
the generic bottom-follow path that could compete with this focus. When a
same-ID recovery returns a latest-50 page that excludes its original action,
the existing status area instead gives a focused, visible saved acknowledgment
and the existing Load earlier path. Its guidance retires when the card is
loaded and clears on a new explicit search/attempt or ordinary confirmed send.
No notification framework, API expansion or history rewrite was added.

Final real browser proof passed **20 assertions** with no page errors: both
roles' new proposals and counters under nonmatching filters, tall cards with
full headings inside the actual scrollport and browser viewport, exact UUID
focus, held older GETs, dropped committed responses and same-ID recovery,
Cancel/Escape, retained text/file drafts, later SSE focus stability, ordinary
multipart text send and actual visible-read persistence. The separate busy
thread proof added 55 actual incoming messages: retry200 excluded the original
UUID, the saved acknowledgment was fully visible/focused, Load earlier reached
the exact card, and a new search cleared guidance. Evidence:
`runtime-accepted.{json,log}`, `busy-retry-fixed.{json,log,png}` and their
screenshots under `.local/patch-phase02-task23/`. Current screenshots were
visually inspected as well as checked geometrically.

### Final source, gates, preserved failures and handoff limits

All final proof binds **159 source/configuration files**, SHA-256
`327377cc01594a2b0fdc67ba25d783ad29ac604a307bb6152e2d00ab6ec2745b`,
standalone build **ONQhJHtaYOeOl2p0-Ng7C**, recorded in
`.local/patch-phase02-task23/source-current.json`. After the last production
edit, `check-postcommit.log` passed strict types, zero-warning lint, formatting,
**98 tests / eleven files / no skips**, markers and production build. Owned
regressions are `tests/proposals.test.ts` and `tests/proposals-http.ts`. The
final ordinary proposal HTTP suite passed current authority/CSRF, both
directions, counters, dates/history, replay/races and actual rollback/retry.
Its guarded retained-55434 fixture milestone INSERT denial was restored in
`finally` and independently verified; `http-proposals-final.json` records the
runtime role, permitted test database and restored grant.

Failed and superseded evidence remains intact. `runtime-1.json` initially
missed a real visibility/scroll precondition for read receipts;
`read-followup.json` proved the actual visible-read contract. Earlier successful
POST/DOM checks did not prove visible tall-card feedback. Screenshots and
`runtime-final.json`, `busy-retry-1.json` and `focus-debug-client-held-trace.json`
exposed the focus-restoration/RAF-before-commit failures that drove the final
post-commit repair. `focus-postcommit-held.json` and the final full browser run
re-exercised that exact held-GET/dropped-response failure successfully.

The initial HTTP historical fixture accidentally stored a JSON string through
raw SQL serializer binding. The tests now explicitly bind text then cast to
JSONB and assert object shape; production does not tolerate malformed string
terms. The untouched harness-only malformed row
`b1161e6d-c01f-4f96-93f0-3c12660ac84f` is labelled in the final HTTP receipt.
It is distinct from genuine old HTTP object records used for recovery proof.
Earlier fixture/type/check failures remain recorded, not relabelled passes.

Canonical 3000 was restored using the unchanged actual root environment
(mode0600, original hash). `canonical.json` confirms its original singleton,
six migration hashes and fourteen empty business tables. Current 3000/3027
service identities are in A23's `service-{3000,3027}.json`; runtime custody was
returned to root with all browser/SQL clients closed. Old 3026, databases,
images, containers and uploads were preserved. No live email, new provider
configuration, extra R2 upload, deployment or Git mutation occurred. These are
source-runtime proofs, not claims about a newly built container image.
Unchanged provider/scheduler facts remain inherited. Maps are stale pending
root's assigned refresh. Fresh QA must independently exercise the integrated
final system, including the mandatory real CUA/native-file-picker and complete
Phase 2/affected inherited workflow matrix. Phase 3 remains on hold until the
user explicitly requests it.
