# Yinsen delivery process

Locked by Neels on 15 October 2026, adapted from BookedBy to the [self-hosted contract](product-contract.md), [five-phase plan](delivery-plan.md) and the explicit task-audit/task-patch workflow below. Product implementation has not started; phase execution requires its authorised launch. This protocol replaces the earlier two-auditor/two-patcher proposal.

Verification importance is **functionality through proof > wired production code > tests and gates**. All three are mandatory. If required behaviour has not been functionally proven, it is not verified. Every role applies this order, and QA works through necessary in-scope repairs to reach truthful VERIFIED acceptance.

## Hierarchy and sequencing

Use **Phase -> Task**. A task is a bounded group of related implementation steps owned by one fresh implementor. There is no additional bundle tier or per-task full audit lifecycle. One orchestrator supervises all tasks in a phase, in dependency order. Phase outcomes and task order are locked; launch binds actual source, resources and files rather than reopening the plan. A chat may supervise further phases only with Neels's execution authorization and predecessor QA acceptance.

The rebuild location is this `yinsen` repository. The original `/Users/sk3_neels/Desktop/client-portal` remains preserved. At Phase 1 launch record the build-start identity; at every later launch validate preceding delivered facts, exact files, configuration and practical exercise environment. Never delete legacy files, reset history or infer a data-migration mandate. Legacy code is outside acceptance unless explicitly incorporated. Material scope/behaviour changes go to Neels; ordinary engineering detail does not need repeated approval.

Each task assignment contains ID/outcome, prerequisites, original-plan references, exact owned files/responsibilities, installed callers, shared-file owner, required behaviour/failures, applicable rules, tests, practical proof and handover target. Planned touchpoints become concrete paths at launch. Load the matching [project role](../../.codex/agents/) explicitly. If the current session has not discovered it, use worker/default with an instruction to read that exact TOML. Fresh contexts receive complete assignments and peer/ownership context, not an assumed inherited conversation. Follow the [skills protocol](../skills.md), including the single-writer refresh policy.

## Task delivery

1. Orchestrator records phase-start source/configuration identity and reads predecessor QA lessons. Dispatch the next fresh implementor. Shared files have one current owner; sequential tasks hand ownership forward explicitly.
2. Implementor reads the task and actual callers at the agreed rebuild location, delivers its entire path, runs required gates and exercises installed functionality. Record entry -> execution/persistence -> provider result where relevant -> visible operator/client outcome, including significant failures. Wiring, tests and proof are part of the task, never optional follow-up passes.
3. Implementor returns changed paths/contracts, actual commands/results, persisted/provider observations, limitations and a concise as-built entry. Orchestrator checks that the assigned outcome is covered and the next task can use it. It intervenes for concrete integration, scope, correctness or evidence problems rather than redoing every task.
4. A task handover names actual proven behaviour and any unperformed resource-dependent check. Unfinished owned code, failed gates, a missing local database or functional failure requires repair and stops dependent claims. A missing external check remains explicitly unverified; it cannot become a VERIFIED phase handover. Do not abandon available in-scope work while resources are resolved.

## One independent wrap per phase

After all phase tasks, freeze one candidate source and effective configuration. Capture commit plus dirty/untracked source identities as needed; a commit label alone is insufficient. All task auditors receive the same candidate and phase/build baselines.

1. Dispatch **X fresh task auditors in parallel**, one per task: three in Phases 1-4, two in Phase 5. Each reviews its entire delivered task, real callers, original acceptance and relevant cumulative system dependencies. Combined assignments cover the phase and its integration with earlier delivered work. No separate phase/system two-auditor stage remains.
2. Each auditor writes its own `docs/audits/phase-NN-task-N.N.md` report. Every finding states **Problem**, **Proposed solution** and **Touchpoints** directly: observed impact/reproduction, suggested smallest root correction, and actual paths/symbols/callers/shared boundaries. Include ID, severity, source/config identity and functional evidence/missing-proof distinction. Cross-reference overlapping roots. A clean task gets a truthful no-findings report, not invented work.
3. After **all X reports exist**, dispatch **X fresh patch agents**, one per report. Each independently checks findings and suggestions, fixes the root or disproves the finding with evidence. Suggested solutions streamline work but are advisory. Its report and agreed shared-root ownership define its surface; no unrelated fixes.
4. Patch agents use the mandatory direct communication protocol below. Orchestrator watches communication/integration and intervenes with the specific owners when overlaps or incompatible changes appear. All dispositions and patches must be complete before QA starts.
5. Fresh **QA**, with write access, reviews all reports/dispositions and the integrated patch, reproduces repairs and repairs remaining in-scope defects. QA independently operates full phase and affected inherited functionality after its last relevant change, inspects persisted/provider facts and runs all gates. It persists through necessary adjustments, rather than returning a fixable failure report and stopping. QA alone issues truthful VERIFIED acceptance; orchestrator cannot override it.

## Mandatory patch communication

Before editing, each patcher sends the other patchers and orchestrator its report/finding IDs, proposed files/shared roots, intended correction and dependencies. Peers acknowledge overlap or state disjoint ownership. A shared root/file has **one edit owner at a time**; agree order/handover and link all affected finding IDs. Reports can share one fix without duplicating edits.

When a change alters another task's contract, notify that owner, agree the consumer update and re-exercise affected paths. Transfer file ownership explicitly. Preserve peers' edits; never overwrite/revert them to make a patch fit. If uncoordinated changes or conflicting differentials appear, stop edits on that shared surface, reconcile with peers and involve the orchestrator. Disjoint fixes continue. Orchestrator monitors the ownership map, messages the specific agents and prevents incompatible simultaneous writes. This is direct agent collaboration, not permission to message external people/chats.

Source/configuration changes invalidate affected evidence. Repeat affected review/checks and functionality, not every unrelated observation mechanically. A new cross-phase defect stays visible with one root owner. Feature suggestions and archived-code defects do not extend the phase. After acceptance stop that phase; prepare the next inputs and proceed only within Neels's execution authority.

## QA acceptance and genuine prerequisites

**VERIFIED is the only successful phase verdict:** required functionality was independently proven, production code is wired and all tests/gates pass. QA works toward this result by repairing and re-exercising its authorised scope. In-progress failures are repair work, not an excuse to hand over a stalled phase or change a test to hide the problem.

If a genuine unavailable external resource or necessary material product decision prevents proof and cannot be resolved autonomously, keep the phase **UNVERIFIED** and name the exact prerequisite, affected behaviour, reproduction, owner and next action. Continue independent available work; do not fabricate access, omit integration code, weaken acceptance or issue conditional completion. Resume affected proof when the prerequisite exists. Only Neels may change scope or execution authority; such a change never retroactively proves omitted behaviour.

Optional Stripe/Resend/S3 use does not excuse a broken advertised adapter. A phase/final candidate cannot be declared verified while its required supported-path proof is missing. Fixtures, readiness and health do not establish business results. QA's repair authority does not authorize deployment, unapproved paid provisioning or unrelated product expansion.

## Five project roles

| Role | Responsibility and boundary |
| --- | --- |
| Orchestrator | Own the phase assignment, task order, shared ownership, candidate baselines, integration and concise records. Supervise real issues; preserve other work. Own any authorized Git mutations under conservative procedure. Never substitute for independent findings or QA. |
| Implementor | Own one complete task, real callers/configuration, tests, practical proof and handover. Use current official contracts and the smallest complete solution. Report unrelated defects without expanding scope; no Git mutations. |
| Task auditor | One independent parallel instance per phase task. Assess its functional behaviour, installed callers and cumulative dependencies; inspect correctness, concurrency/idempotency, security, integration accuracy, tests, dormant code and unnecessary complexity. Write only its task report. |
| Patch agent | Verify assigned findings, fix/disprove with evidence, coordinate overlaps and exercise affected callers. Preserve original findings and other agents' edits. No Git mutations or phase verdict. |
| QA | Inspect/repair integrated patches, independently operate the installed system, inspect persisted/provider outcomes and issue the sole phase verdict. QA may delegate bounded repairs/investigation but must review them and retain its judgment. No Git mutations. |

All roles read root AGENTS, contract, assigned plan section, this process, standards and relevant inherited evidence. Every assignment explicitly says agents share the workspace and must preserve others' edits. No role may deploy. Auditors are report-only by task contract, not by an assumed tool sandbox.

## Small records and a finite stop rule

Create records when actual work begins, not fictional histories now:

- `docs/as-built/system.md`: current delivered boundaries, decisions, next owner and outstanding checks.
- `docs/as-built/phase-NN.md`: chronological task handovers, patch dispositions, QA verdict and concrete escaped-issue lessons; one assigned writer coordinates shared entries.
- `docs/audits/phase-NN-task-N.N.md`: one report per task; each auditor owns original findings. Append patch/QA dispositions instead of erasing problems, proposed solutions or touchpoints.

Evidence is source/environment-bound and redacted; never publish credentials, raw personal payloads or bulk generated proof logs. Every finding ends fixed with evidence, disproved with evidence or explicitly open. Use these records instead of duplicate trackers. Do not copy BookedBy's historical custody detail into empty Yinsen records.

The finite plan is fourteen task outcomes, fourteen task reports, fourteen report-specific patch handovers and five verified phase acceptances. Each phase has one parallel audit stage and one coordinated patch stage, followed by QA repair/proof. No arbitrary extra provider/feature target or perpetual polish pass. In-scope defects must still be repaired; a time/reset budget cannot convert failure into acceptance. Revisit a completed check only after a relevant change, failure or unresolved evidence concern.
