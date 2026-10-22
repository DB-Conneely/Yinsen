---
name: graphify
description: Query Yinsen's local code graph for callers, impact and ownership during implementation, task audits and coordinated patches; refresh stale graphs through refresh-context.
---
# Graphify for Yinsen

Use the installed local Graphify CLI and inspect `graphify --help` for supported syntax. The graph must belong to this repository and the current recorded source. If absent/stale, use the repo-local refresh-context skill with one writer. Report unavailable tools or incomplete maps without treating them as proof.

Useful installed commands include `graphify affected "Symbol"`, `graphify explain "Symbol"`, `graphify path "A" "B"` and `graphify query "question"`, with `--graph graphify-out/graph.json` where needed. These commands inspect the local graph. Read actual source and installed callers to verify any inferred ownership/connection.

Use graph impact to coordinate cross-task findings and patch files. It does not grant file ownership, replace peer communication or prove runtime behaviour. Never tune clustering to manufacture a quality score.

Extraction is only `graphify extract . --code-only --no-cluster`; optional clustering only `graphify cluster-only . --no-label --no-viz`. No API/semantic labeling, global graph, external corpus, hook installation or automatic watcher is authorised. Exclude secrets, private data, raw proof, dependencies, builds, generated maps and the legacy planning archive. Don't use `--force` to overwrite a suspiciously smaller graph without understanding the changed source scope.
