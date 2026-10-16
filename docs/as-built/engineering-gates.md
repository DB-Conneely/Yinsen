# Installed engineering gates

Task 1.1 installed the following commands. Tests/configuration/scripts are included in strict checking; only generated framework declarations are excluded from lint, not from TypeScript.

| Requirement                                                         | Actual command and configuration                                                                                                                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict app, tests, scripts, configuration and generated route types | `npm run typecheck`: `next typegen` then `tsc --noEmit`; `tsconfig.json` enables strict, implicit returns, fallthrough and unchecked indexed access checks                               |
| No explicit/implicit any, unsafe operations or floating promises    | `npm run lint`: ESLint plus typescript-eslint recommended type-checked rules and explicit no-any/no-floating/no-non-null rules; strict compiler rejects implicit any                     |
| Explicit public returns and no unused variables                     | Type-aware lint; explicit return annotations on functions, unused underscore parameter convention only                                                                                   |
| Next, React hooks and accessible markup rules                       | `eslint-config-next/core-web-vitals` applies through the same lint command                                                                                                               |
| Formatting                                                          | `npm run format:check`; Prettier checks delivered source/tests/scripts/configuration, README/operator/as-built docs; generated declarations, lockfile and Drizzle snapshots are excluded |
| Meaningful public function and installed database checks            | `npm test`; Vitest runs configuration/errors, real PostgreSQL/schema/privilege/rollback, startup hook, health handler, logging, root rendering and security-header tests                 |
| Installed HTTP caller                                               | `npm run test:http` against an ordinary running development or production server                                                                                                         |
| Unfinished/suppression markers                                      | `npm run check:markers`; scoped `rg` passes only with exit 1/no matches, and fails on matches or scan errors                                                                             |
| Production compilation and standalone artifact                      | `npm run build`; Next.js standalone output with actual migrations included; startup guard is exercised separately                                                                        |
| Combined required checks                                            | `npm run check`; runs types, lint, formatting, tests, marker scan and build sequentially                                                                                                 |

The install uses current supported Next 16 contracts. ESLint provides the required type-aware promise/unsafe checks, which documentation-only rules or a formatter cannot enforce. Exact direct versions and transitive integrity hashes are pinned in `package-lock.json`. `skipLibCheck` skips third-party declaration internals only; all delivered TypeScript and generated Next route types remain checked.

Gate exercise results and controlled rejection probes are recorded in [Phase 1](phase-01.md). No gate result is a phase acceptance; fresh QA owns that verdict.
