---
paths: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"]
---
# TypeScript rules

These apply to all delivered TypeScript, including tests, configuration, scripts and framework entrypoints. Agents explicitly read this file; path metadata is not a substitute for loading the instructions.

- `strict: true`, `noImplicitReturns` and `noFallthroughCasesInSwitch`; no exceptions. Typecheck includes tests and applicable generated route types.
- No explicit or implicit `any`. Start untrusted values as `unknown`, validate and narrow. No unsafe casts to silence a boundary error.
- Explicit return types on exported/public functions. Internal trivial inference is fine. Every exported/public function has meaningful test coverage.
- Type-aware lint rejects floating promises and unsafe operations. Unused variables fail except intentionally unused underscore-prefixed parameters where configured. Tests are not blanket-excluded. Include React hooks and Next framework rules on their surfaces.
- Use typed error classes or discriminated results; no raw `throw new Error("string")` in product paths. Expose stable safe errors at HTTP boundaries.
- Discriminated unions for state; validate transitions with the shared domain writer. Do not rely on arbitrary string/boolean combinations.
- Monetary amounts are integer smallest units. Define deterministic rounding for decimal quantities and test edges. No floating-point equality for money/quantities.
- No `!` non-null assertion without adjacent `// ASSERT:` proof; no unavoidable cast without adjacent `// CAST:` justification. Neither comment excuses a wrong assertion.
- No `@ts-ignore`, `@ts-expect-error`, lint/format suppression or disabled check without an adjacent reason and narrow scope. No blanket weakening to clear gates.
- Named exports except framework-required default exports. No barrel re-export unless the module boundary is intentional/documented. Comments explain why.
- Functions longer than forty lines split along genuine responsibilities. Do not replace one readable function with unnecessary abstraction merely to move lines around.
- Pin exact package versions; no `^` or `~`. Current version-specific framework docs take precedence over remembered APIs.
- Strict checks are required in addition to real functional proof and production wiring; they cannot establish either one alone.
