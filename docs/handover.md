# Foundation handover

15 October 2026. **Product plan and protocol LOCKED. Phase 1 NOT STARTED.** This repository contains documentation, project roles/rules/skills, license and Git hygiene only. No application scaffold, dependency install, compiler/linter configuration, database, provider setup, product functionality verdict or deployment exists yet.

## Locked decisions

- MIT self-hosted, one operator plus clients, configurable branding/business settings and operator-owned infrastructure/providers. Optional paid installation remains outside product code.
- Five phases/fourteen tasks. Phase 1-4 each have three tasks; Phase 5 has two.
- Functional proof > wired production code > tests/gates. All are required; unproven behaviour is never verified.
- One orchestrator per phase; sequential fresh implementor per task; X parallel task auditors; X directly communicating patchers; fresh write-capable QA persists through repair and alone issues truthful VERIFIED acceptance.
- Audit reports explicitly identify problem, proposed solution and direct touchpoints. Patchers independently assess suggestions, coordinate shared roots/files and preserve peers' changes; orchestrator monitors the coordination.
- No product implementation in this setup turn. Existing client-portal repository/history/plans remain preserved; the new independent implementation location is this `yinsen` repository.

## Starting Phase 1 later

In a chat rooted at this repository, a suitable launch is:

> Start Phase 1. You are the phase orchestrator. Read AGENTS.md, .codex/agents/orchestrator.toml, docs/rebuild/README.md, the locked product/delivery documents, all .codex/rules files, docs/skills.md and this handover. Deliver Tasks 1.1, 1.2 and 1.3 sequentially with fresh implementors. Then run three parallel task audits, three coordinated report-specific patch agents and fresh QA under the locked process. No deployment.

That example is a future launch prompt, not current execution authority. Actual phase launch binds the current source baseline, exact task files, resources and ownership. It does not reopen the locked plan routinely. Material scope changes return to Neels; ordinary implementation/repair remains autonomous.

Phase 1.1 owns actual dependency/version choice, compiler/linter/test/build commands, real PostgreSQL/startup/migration/container paths and installation of all mandatory engineering gates. Subsequent tasks own setup/operator and client access. Do not mark the product verified from this foundation's documentation checks.

## Context and resources

Repo-local skills are present and wired through AGENTS and the five role files. Cortex/Graphify are local developer tools, not app dependencies; no application source exists to map yet. Refresh when actual source is introduced, under the code-only/single-writer skill. No provider secret is required or read for foundation setup. Future optional-provider tests must use actual permitted non-production resources and remain unverified until exercised.

Create as-built/task audit/QA records only when actual delivery occurs. The [delivery plan](rebuild/delivery-plan.md) specifies complete task outcomes and proof. There are no fictional task handovers or accepted phases in this repository.

## Foundation validation

Foundation checks completed on 15 October 2026:

- All active Markdown links resolve locally; TOML parses; five role names and fourteen task packets are present with ownership/touchpoints/proof/handover. Active documents point to the new protocol and mandatory rules; legacy text is reference only.
- All four repo-local skills pass the bundled Skill Creator validator. Ponytail's unsupported top-level argument-hint metadata was moved under supported metadata; its instructions and MIT notice remain present.
- Twenty private/generated-file ignore cases and thirteen must-track cases passed against actual `git check-ignore`, including environment examples, migrations/journals, lockfiles, rules, roles and skills. No representative test files were created.
- Original product/directive/later hardening copies match their source bytes; original implementation copy matches the named Git revision. The old repository's source/plans/refs/history remain preserved.
- Local native Cortex core and Graphify help/CLI contracts were inspected. Cortex's wrapper is not on every shell PATH; refresh-context documents verified native-core fallback. No code maps were generated because there is no application source. No new source/dummy app was created to manufacture extraction proof.
- Codex's official standalone-role and repository-skill conventions were checked. Local TOML validation passed. The installed CLI rejects `--strict-config` with its `features` command, so that attempted command is not claimed as native role/config loading proof. New-session discovery or explicit role/skill-file loading remains the launch path; no model session was started to test discovery.

These validate foundation artifacts only, not compiler/linter enforcement, product behaviour or Phase 1. The local initial commit records the reviewed foundation; no remote is configured and no push/deployment occurred.
