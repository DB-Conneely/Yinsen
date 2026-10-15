---
paths: ["e2e/**", "tests/**", "**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"]
---
# Tests and functional evidence

- Verification priority is functional proof > wired production code > tests/gates. All three are mandatory. Green checks cannot certify unexercised behaviour.
- Use the actual installed owned browser/HTTP/domain/database/file/schedule paths. Mock only external boundaries that cannot run deterministically, never the Yinsen behaviour the test claims to establish.
- Real PostgreSQL/migration/transaction/authorization proof uses an isolated synthetic instance. Local PostgreSQL is the selected self-hosted topology; do not copy BookedBy's hosted-Supabase-only requirement.
- Provider fixtures follow native versioned payloads/signatures. Signature/deduplication/domain handlers run for real. Configured non-production provider results need their separate real exercise; a fixture cannot supply it.
- Every exported/public function has a meaningful test; changed acceptance behaviour also needs real caller and practical proof. Regression checks target the root cause and fail against the defect where practical; otherwise retain reproducible evidence and state the limit.
- Do not weaken assertions, skip a failure, fake product routes/modes, copy production logic into expectations or mock owned results to clear gates. No sleeps/retry-until-pass loops; await explicit completion/events and control external time/fixtures deterministically.
- Observe denial, replay, failure/rollback and relevant races as well as success. Inspect persisted/provider facts and user-visible outcomes after the last relevant patch.
- QA independently operates the integrated installed product and has write authority to repair in-scope issues. It continues until truthful acceptance, never issues VERIFIED without proof, and never abandons an autonomously fixable defect as a final report.
- Redact evidence and bind it to source/environment/configuration. Generated context and test counts are navigation/check metadata, not proof of business behaviour.
