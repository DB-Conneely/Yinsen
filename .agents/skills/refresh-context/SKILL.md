---
name: refresh-context
description: Refresh Yinsen's local Cortex narrative/dependency map and separate Graphify code graph after structural changes or before a stale candidate review; never substitutes for functional proof.
---
# Refresh context

Refresh context for this repository. Read root AGENTS and the assigned scope. Source, applicable contracts and observed functionality remain authoritative; maps are navigation aids, not correctness or completion evidence. Private records are additional context only when supplied.

One assigned writer refreshes maps at a time. Readers may use the completed snapshot. Don't run overlapping refreshes from parallel auditors/patchers. Refresh after new/moved files, export/dependency changes and before frozen-candidate review when maps are stale; record the source identity. After compaction first reread the current handover/role/phase and inspect actual changes, then refresh if required.

From the repository root:

1. Confirm the actual Cortex core and Graphify executables with `command -v` and local help/version. Prefer a verified native `cortex-core`; use the `cortex` wrapper only if it resolves a real core rather than recursively resolving itself. Report unavailable tools rather than silently installing an unrelated dependency or hardcoding machine paths into the app.
2. Confirm the intended application source scope. Do not add dummy code, scan an unrelated repository or claim a fresh graph from an incomplete extraction.
3. Inspect the scope/exclusions: source/checked-in tests/config only; no `.env*`, keys, database/files, `.local`, raw proof/logs, dependency/build output, `docs/legacy`, generated Cortex/Graphify output or cross-repository inputs. Keep generated outputs under the root ignored directories. Confirm the tool honors exclusions before scanning populated/private working trees.
4. Generate Cortex separately using `cortex-core init` (or `cortex-core refresh` after initialisation). A verified wrapper may use its equivalent `cortex init`/`cortex refresh`. Never invoke `factory`/`input` or revive the old autonomous build loop. Don't generate a concatenated full-source dump merely because the old skill did; Yinsen has no `generate_full.py`/tree script contract.
5. Run `graphify extract . --code-only --no-cluster`. The explicit flags restrict extraction to local AST and avoid semantic/model labeling. If clustering is useful, run `graphify cluster-only . --no-label --no-viz`. Never omit code-only/no-label, use global graph registration, hooks, automatic watchers or billable semantic enrichment.
6. Each required command must exit zero before the next. Stop on error; preserve/identify the last valid source-bound map and report the actual failure. Do not mislabel a partial map as current or restart unrelated application checks.

Inspect `cortex-context/context.md`, `cortex-context/graph.json` and `graphify-out/graph.json`. Record source/config identity, command exits, source-file count, narrative line count and Graphify nodes/edges; parse JSON and spot-check actual changed callers/exports. Keep these outputs ignored and private. For local navigation use the separate graph locations correctly; Cortex never substitutes for Graphify.

This skill changes generated context only. It does not change product source, phase scope, secrets, Git refs or verification verdicts. An unavailable mapper is a context-tool limitation, not functional proof or automatic permission to abandon a repair.
