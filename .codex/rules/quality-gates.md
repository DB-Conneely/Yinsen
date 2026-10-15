# Base quality and verification rules

Mandatory for all Yinsen work and every role. Read with [TypeScript](typescript.md), [frontend](frontend.md), [server](server.md), [tests](tests.md), [AGENTS](../../AGENTS.md) and the locked delivery process. Inspired by BookedBy; its unrelated provider/runtime requirements are not inherited.

## Verification importance

1. **Functionality through proof:** exercise the actual installed behaviour and observe the persisted/provider/user result. Unproven behaviour is not verified.
2. **Wired production code:** the exact installed entrypoint must reach every delivered component. Wire/exercise dormant code or remove it.
3. **Tests and gates:** compiler, lint, build and meaningful automated tests must pass. They are mandatory supporting evidence, never substitutes for the first two.

Every required item must pass; priority does not waive lower items. QA owns the phase verdict, has write authority and continues through necessary in-scope repairs until functionality can truthfully be VERIFIED. A real unavailable prerequisite remains explicit unverified work, not accepted functionality.

## Required before task handover and phase acceptance

- Strict typecheck has zero errors across app, tests, configuration and framework-generated types where applicable.
- Type-aware lint and framework/hooks rules have zero warnings; formatting checks pass. All configured tests pass without hidden failures/skips. Production build succeeds.
- Every exported/public function has at least one meaningful test. Each acceptance behaviour also has a real-caller check and practical functional evidence; export coverage alone proves nothing about the full journey.
- No unfinished `TODO`, `FIXME` or `HACK` in delivered source; no unjustified error/type/lint suppression. A scoped forbidden-marker `rg` scan passes with no matches/exit 1, fails on matches/exit 0 or scan errors. Ordinary build/lint/type/test commands must exit zero.
- Source/configuration identity matches the evidence. Relevant changes invalidate affected proof; re-exercise affected behaviour after the last change.
- Real installed ownership, authorization, validation, accessible UI and errors that prevent data loss are never shortcuts.

Phase 1.1 must install and exercise the compiler/linter/test command mapping in the real project. Until then these are mandatory instructions, not a claim that nonexistent compiler settings have run. Command mappings belong in an actual as-built engineering-gates record when installed, not a fictional record now.

## Scope and simplicity

- Implement the locked task and necessary prerequisites only. Quality words do not authorize adjacent features, abstractions, infrastructure or extra states.
- Prefer the fewest files/concepts/dependencies that fully deliver the requested behaviour. Reuse native/framework and already working project mechanisms first.
- Preserve agreed user journeys. Material behaviour/scope changes go to Neels; routine engineering and in-scope repair stay autonomous.
- Each task owns callers, configuration, data, UI, tests and proof. Shared primitives arrive with their first real consumer; no speculative libraries or fake routes for proof.
- Stop when the finite scope and required functional evidence are complete. Report unrelated defects without silently enlarging the task.

## Integration, editing and privacy

- Check current official docs for the exact pinned framework/provider contract. Keep required server configuration connected from `.env.example` through validation to actual consumers; never invent keys or fake success.
- Missing secrets do not justify missing owned code. Prove available real behaviour and name the precise unperformed provider check. No final phase acceptance while required proof is absent.
- Use deliberate contextual edits. Do not rewrite source through ad hoc Python/Node/shell replacement scripts. Read surrounding code and callers. Scripts are appropriate for inspection, checks and explicit generators. No U+00A0 characters.
- Preserve others' work. Auditors write only their reports; patchers communicate ownership and shared edits; QA repairs and verifies. Only orchestrator performs authorised Git changes. No agent deploys.
- Do not commit secrets, credentials, customer data, raw logs, generated context or proof dumps. `.gitignore` supports this; it never substitutes for staged-content review.
