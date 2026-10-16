# Phase 1 — installation and identities

Started 16 October 2026 under Neels's explicit Phase 1 launch. Orchestrator: chat `phase1 yinsen` (`01a141f9-c66f-7570-b072-525562c2dc57`). Primary checkout: `/Users/sk3_neels/Desktop/yinsen`.

## Build baseline and ownership

- Initial source: `a798302d63b4b3279b8476bc6ccd2724e5011bfb` on local `main`; clean index/worktree. No remote, tag or stash. One primary worktree; existing Codex capture ref preserved.
- Git identity is already configured. Only the orchestrator mutates Git. Work remains in this checkout and finishes on local `main`; no push or deployment.
- Locked sequence: 1.1 foundation, 1.2 setup/operator, 1.3 clients/access; then three parallel task reports, three coordinated report-specific patchers and fresh repairing QA.
- Current acceptance: **PAUSED / UNVERIFIED — Task 1.1 unfinished**. This record authorizes no Phase 2 work.
- Resource baseline: Node/npm and Docker CLI are present. No application configuration or application database existed in the foundation. Task 1.1 establishes isolated local resources and records their exact ownership.
- One implementor owns product edits at a time. Orchestrator owns Git and coordination; task owners maintain this chronological record and `system.md` while assigned. Map refresh has one assigned writer.

## Task handovers

No complete task handover yet. Required evidence is installed functional proof, wired production code and passing engineering gates. QA alone can issue Phase 1 VERIFIED acceptance.

## Task 1.1 partial delivery and observed evidence

- `ecff931`: authorized launch records. `7b367dc4de86df3c86d5643a122fc5c06612c674`: initial application/gates increment on local `main`.
- Installed direct versions are pinned in `package.json`/lockfile: Next 16.4.2, React 19.3.1, Drizzle ORM 0.45.4, postgres.js 3.4.9, TypeScript 5.9.3. Local Node is 22.21.1; Docker uses pinned Node 22.21.1 Bookworm slim and PostgreSQL 16.13 Alpine images. No operator/client schema or business functionality was introduced.
- The installed caller is `/` and `/api/health`, with instrumentation startup configuration/schema checks. The database has an installation singleton consumed by health and a Drizzle migration ledger. Explicit migration/status commands use the migrator role; app queries use a bounded runtime pool. Both roles lack superuser/create-database/create-role privileges; runtime DDL and migration-ledger writes are denied.
- Implementor reported clean dependency install, strict typecheck, type-aware lint, formatting, 26 real-DB/unit tests, marker scan and production build passing. A final combined `npm run check` exited zero **before the latest standalone/startup changes**. Retained `.local/gate-type-probe.txt`, `gate-lint-probe.txt` and `gate-marker-probe.txt` show deliberate implicit-any, floating-promise/unused-variable and unfinished-marker rejection. The temporary probe source was removed.
- Implementor exercised unmigrated `db:status` and dev-start refusal; explicit migration/status/rerun; actual development HTTP `/` and health; database loss -> safe health 503 -> recovery 200; migration-hash tamper -> schema 503 -> exact hash restoration -> 200. These are earlier observations, not proof of the interrupted final patch.
- Orchestrator independently observed health 200 with full safe API envelope, no-store/correlation/security headers on port 3001, and Compose health 200 on port 3000. It queried the actual database: one installation row with timestamp, one migration row with a 64-character hash, and both nonadministrative roles. The app/database containers were healthy before shutdown.
- Implementor reported a nonroot production container without a copied `.env` or migrator credentials, and an approximately 104 MB earlier app image. That image predates the last startup patch and is not an accepted final artifact. Browser tooling was unavailable to the implementor; Task 1.1 page evidence used actual HTTP plus SSR rendering tests, not a screenshot. No operator/client browser journey is claimed.
- The disk initially reached roughly 100 MiB free and npm/Docker failed. Neels freed space; work resumed at 21 GiB available. Docker recovered without deleting images/volumes. A shell-init mount problem was replaced by `docker/init-database.sql`, using native psql environment variables and a second fresh project/volume. The first failed-bootstrap volume was preserved. An Alpine Node image returned signal 139; the current Dockerfile selects a pinned Bookworm slim image. Do not delete the preserved resources to bypass a failure.
- Implementor reported nine development-tool transitive audit advisories involving Drizzle/esbuild and Next lint/glob. Their current disposition was not independently completed. Review compatible fixes/reachability on resume; do not silently claim a clean dependency audit.

## Exact interrupted correction and source identity

Native `next start` warned that it does not support standalone output. Both it and the earlier standalone path could keep a failed process alive after instrumentation threw, although health did not become ready. Next also traced root dotenv files into generated standalone output. The latest edits address these actual findings:

- `package.json`: build runs static/environment-output preparation; start uses the supported standalone launcher.
- `scripts/start.ts` (untracked): loads the current root environment and starts standalone `server.js`, forwarding termination signals.
- `scripts/standalone.ts` (untracked): copies static assets and removes only generated dotenv copies from standalone output.
- `src/instrumentation.ts` (modified): safe fatal code logging and process exit 1 when required configuration/schema checks fail.

The final checks/proof after these edits were **not confirmed before interruption**. Do not treat the earlier green run, generated output or old container as proof of this source.

At pause, 38 source/configuration files have combined SHA-256 `9eda9746034d7ecc98b48a651d109f6805f5237b0649d4343db03f67c3c98ab4`. Definition: enumerate unique `git ls-files --cached --others --exclude-standard` paths, retain all files under `src/`, `scripts/`, `tests/`, `drizzle/`, `docker/` and these root files: `.dockerignore`, `.env.example`, `.graphifyignore`, `.prettierignore`, `.prettierrc.json`, `Dockerfile`, `compose.yaml`, `drizzle.config.ts`, `eslint.config.mjs`, `next-env.d.ts`, `next.config.ts`, `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`. Sort paths lexically, concatenate each `path + NUL + SHA256(file bytes) + LF`, then SHA-256 that UTF-8 concatenation. Documentation-only pause edits do not change this identity; private `.env`/logs and generated output are excluded.

Initial pause inspection, before this documentation operation:

| State     | Paths                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modified  | `README.md`, `package.json`, `src/instrumentation.ts`; `AGENTS.md` also contains Next's generated guidance append                                                             |
| Untracked | `.dockerignore`, `.env.example`, `.graphifyignore`, `Dockerfile`, `compose.yaml`, `docker/init-database.sql`, `docs/operator.md`, `scripts/standalone.ts`, `scripts/start.ts` |

The pause commit records `AGENTS.md`, `README.md` and `docs/operator.md` alongside the handover/as-built updates; its `AGENTS.md` change retains the already-generated Next guidance. It changes documentation/resource guidance only. `package.json`, `src/instrumentation.ts`, `.dockerignore`, `.env.example`, `.graphifyignore`, `Dockerfile`, `compose.yaml`, `docker/init-database.sql`, `scripts/start.ts` and `scripts/standalone.ts` remain dirty/untracked and are not accepted or staged by that commit. Index was empty before this documentation operation. Original history, Codex capture/checkpoint refs, files and volumes remain preserved. A future clone/SSH move must preserve these uncommitted files and recreate or securely transfer any required private configuration/data deliberately; a clone of `main` alone does not contain this interrupted patch.

## Outstanding Task 1.1 work on explicit resume

Run heavy commands one at a time, with no overlapping host checks/builds and Docker image builds. Re-establish implementor ownership after reading the exact current source; the earlier agent is no longer available. Do not start Task 1.2.

1. Finish/check the last standalone/startup correction and its meaningful regression/installed-path evidence. Run types, lint, formatting, tests, marker scan and build against the actual final source; earlier passes were before that patch. Source production startup, normal HTTP/static assets, invalid required configuration and schema failure must demonstrate the intended safe exit/readiness behavior.
2. Build and exercise app and migration/tools images **serially**. The tools-image explicit migration/status commands were still in progress/unconfirmed. Never pass migration/admin secrets into the app image/runtime. Inspect generated output for copied dotenv files without displaying secrets.
3. Complete container restart/persistence proof and repeat affected health/failure/recovery checks after the last relevant code change. Query actual persisted state; do not reset the existing database or use helper-only proof. Keep source/dev/build use of `.next` sequential.
4. Review reported dependency advisories and document actual scope/disposition. Inspect installation instructions against executed commands, including separate privileges, existing-volume behavior and current startup semantics.
5. Refresh maps once, with one writer, after the last structural edit. Ignored Cortex/Graphify maps already exist but predate the final standalone edits and are **stale**. Implementor reported partial Cortex tagged-template parsing and an unavailable optional SQL parser in Graphify. Restore truthful source-bound maps; do not treat them as functionality proof.
6. Finish concise as-built/task handover, reconcile current documentation and commit checked coherent increments. Only then stop at Task 1.1's handover and await Neels's instruction before Task 1.2.

## Pause, services and supervision lesson — 16 October 2026

Neels asked for a natural seam, then reported laptop overload/crash and explicitly requested documentation and pause. The final Task 1.1 correction was interrupted before its checks/handover completed, so the seam is **inside Task 1.1**, not an accepted task boundary.

Only containers observed running at shutdown were `yinsen_phase1_v2-app-1` and `yinsen_phase1_v2-postgres-1`; both `docker stop` operations succeeded. `docker desktop stop --timeout 15` exited zero. No host build/test/server process was visible; live agents showed only the orchestrator. No heavy checks/builds were run for this pause documentation. Containers, volumes/images, root `.env` (0600), source and private gate evidence remain preserved.

Resource project: `yinsen_phase1_v2`; previous bindings app `127.0.0.1:3000`, database `127.0.0.1:55432`. On a later **explicitly authorized local resume**, start Docker Desktop deliberately, inspect existing resources/volume names, then `docker compose -p yinsen_phase1_v2 start postgres`; check health and `npm run db:status` using the current ignored `.env`. Do not use a new default project accidentally. The earlier failed-bootstrap volume's exact name must be recovered by inspection; it was not inventoried with Docker stopped. No cleanup/deletion is authorized.

Host production checks overlapped Docker image builds. The Mac was observed with 8 GiB RAM and about 4.7 GiB swap in use; exact crash causation was not established. **One heavy command across all agents at a time** is now mandatory, including future audit/QA workers. The database fixture may stay running for a host database test; that does not permit another build. Do not run heavy work to validate documentation-only edits.

SSH is a possible future execution location, not an authorized migration: no target or transfer was selected. Wait for Neels's explicit resume/host direction. No automatic resumption, Task 1.2 dispatch, audit stage, QA verdict or Phase 2 handoff occurred.

## Retained future provider and phase boundary

Neels authorized implementation from official Resend contracts with credentials supplied later. After work resumes, absent Resend must not stall available local work or the audit/patch/QA sequence; actual configured delivery and a working emailed login link remain the final external proof before Phase 1 VERIFIED. Task 1.3 has not started. Stripe/S3 proof belongs to later tasks. No project/file/invoice authorization is claimed here.

The existing chat titled exactly `phase2 yinsen` was uniquely found at launch, but no message was sent. Fresh QA alone may issue VERIFIED; the orchestrator must then finish records/commits, reconcile accepted source/configuration and stop phase writers before re-resolving the destination and sending the authorized handoff. Phase 2 implementation remains outside this chat's scope.
