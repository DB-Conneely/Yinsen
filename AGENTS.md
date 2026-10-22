# Yinsen delivery rules

## Working product and assigned scope

Yinsen is a working MIT-licensed self-hosted portal for one operator and client accounts. Keep contributions within the assigned outcome and preserve the installed product, user data and meaningful history. Repository instructions do not authorise publication, infrastructure provisioning or deployment.

Read [README](README.md), [INSTALL](INSTALL.md), [OPERATIONS](OPERATIONS.md), [CONTRIBUTING](CONTRIBUTING.md), all five `.codex/rules/*.md` files and the assigned `.codex/agents/*.toml`. Load the repo-local skills under `.agents/skills/`. If the assignment supplies private plans, handover, as-built or QA records, read them as additional local context; they are not prerequisites for a public checkout and must not be published.

Authority: repository owner's instructions -> this file -> assigned contract/plan -> rules/role -> non-conflicting historical detail. Historical documents and generated maps cannot override this authority. A plan is not proof of delivery.

## Verification order: all three required

1. **Functionality through proof.** Operate the actual installed system, inspect persisted/provider facts and observe the real user outcome. If required behaviour is not functionally proven, it is **not verified**.
2. **Wired production code.** Every delivered component must be reached by the installed application path. Wire and exercise dormant code or remove it. A helper-only demonstration, fake route or test mode does not count.
3. **Tests and gates.** Strict types, lint, build, meaningful tests and all engineering checks must pass. They support proof and cannot substitute for either of the first two requirements.

This ranks evidence, not chronological coding/testing steps; develop and verify iteratively. It is not permission to omit a lower item. QA repairs and re-exercises failures until it can truthfully issue VERIFIED. It must not stop at a fixable defect, use missing secrets to omit owned code, or manufacture a verified verdict. A genuine unavailable prerequisite remains explicitly unverified and blocks the affected phase claim.

## The entire build workflow

For an assigned multi-task phase, follow its explicit delivery protocol below. Routine contributions do not restart the completed rebuild or automatically create a phase/audit lifecycle.

- One orchestrator owns a phase. Dispatch one fresh implementor sequentially per task. Each owns its complete caller, configuration, persistence, UI, tests, functional proof and handover. Phase/task scope is already locked; bind actual paths/resources at launch without reopening routine choices.
- At phase end, freeze one candidate. Spawn **X parallel task auditors**, one per phase task: X=3 in Phases 1-4, X=2 in Phase 5. Each writes its own report naming **problem, proposed solution and direct touchpoints**, with reproduction/evidence. Audit each task in the cumulative installed system, including affected earlier paths.
- After all X reports exist, dispatch **X fresh patch agents**, one per report. They independently verify findings and proposed solutions, fix root causes or disprove findings with evidence. Each owns a declared surface; no blind implementation of suggestions.
- Patch agents **communicate directly before shared edits**, announce ownership, coordinate overlaps, name one owner per shared root/file and exchange changed contracts. Orchestrator monitors, messages the relevant owners when integration conflicts arise and prevents concurrent conflicting edits. See the process for the exact coordination protocol.
- Fresh QA begins after all patches and dispositions. QA has write access, verifies/repairs integrated patches, operates the installed system and owns the sole phase verdict. It persists through in-scope repairs and verifies after its last relevant change. Orchestrator cannot replace or override QA.
- No extra two-auditor/two-patcher lifecycle, per-task full wrap, perpetual polish pass or speculative features. Scope changes need Neels; routine implementation/repair does not. Stop when the agreed scope and functional proof are complete.

## Boundaries

- Build the MIT open-source self-hosted portal: one operator plus client accounts. Paid installation is an external service; no managed SaaS, Connect, subscription platform, staff accounts or dormant future machinery.
- Every agent explicitly loads its role, all base/TypeScript rules and applicable path rules. The orchestrator loads its role itself; a role file does not configure the main chat by implication. `.codex/agents` supplies five project roles; fallback dispatch must read the exact same file.
- You are not alone in the workspace. Preserve others' work; coordinate shared files. Only orchestrator performs authorised Git mutations under the local GitHub workflow skill. Inspect working tree/index/refs/remotes/branches/tags/stashes/worktrees/reflogs/history first; retain recovery paths and logical commits.
- No history rewrite, repository identity change or deletion of original history/data/recovery copies without explicit authorization for exact destructive targets after stating the consequences. Remote pushes/publication require the owner's explicit authorization for the target and action; never force-push. No agent deploys in any form; the owner controls deployment through GitHub CI/CD.
- Use the smallest complete implementation. Do not weaken validation, authorization, error handling, accessibility, tests or functional proof to save time. Do not add unrelated surfaces or conduct an audit of the preserved old implementation.
- Run heavy builds and checks **one at a time across all agents**. Never overlap Docker image builds with host builds/checks. Wait for each heavy command to exit before starting another; do not leave heavy commands running in the background. PostgreSQL may run as the required database fixture during a host check. This resource rule follows the laptop overload on 16 October 2026.

## Context and skills are supporting tools

Use the repo-local GitHub workflow, Ponytail, refresh-context and Graphify skills under `.agents/skills/`. Refresh maps after structural changes and before candidate review when stale. Use local code-only Graphify and unlabeled clustering; no billable model calls, global cross-repo graph, hooks or automatic build loop. Maps aid navigation and never establish functionality. Missing/stale maps must be reported and restored, never claimed current.

The command mapping is in `package.json`, with isolated PostgreSQL verification described in CONTRIBUTING. Documentation alone never establishes a passing gate or functional proof. Private `docs/`, `.local/`, environments, data and generated maps remain outside the published tree; ignore rules do not replace tracked-content and history review.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
