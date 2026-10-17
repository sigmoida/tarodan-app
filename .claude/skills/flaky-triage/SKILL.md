---
name: flaky-triage
description: Triage a flaky or intermittently failing test in tarodan-app (reproduce, classify the cause, fix the same day or quarantine with a backlog line). Use when a test passes and fails without code changes, or CI is red on an unrelated change.
argument-hint: "<test file or CI run>"
---

# Flaky test triage

Test: $ARGUMENTS

Policy (tarodan-ops: `docs/test-strategy.md`): fix a flaky test **the same day**
or quarantine it with an owner. Never retry until green.

## 1. Reproduce

```bash
cd apps/api && for i in $(seq 1 20); do npx jest <path> --maxWorkers=2 --silent || break; done
cd apps/api && npx jest <path> --runInBand            # order-dependent?
pnpm --filter @tarodan/web exec vitest run <path> --sequence.shuffle
```

Compare with the CI log (`gh run view <id> --log-failed`): same failure, same
test, same seed? Note the time and timezone of failing runs.

## 2. Classify

| Cause                | Signs                                                              | Fix                                                                                         |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Time                 | fails near midnight, month end, DST; deadlines, `new Date()`       | freeze time (`test/test-utils/time.ts`, fake timers); compute in Europe/Istanbul explicitly |
| Order / shared state | passes alone, fails in the suite                                   | reset mocks and module state in `beforeEach`; no shared mutable fixtures                    |
| Async                | missing `await`, unawaited promise, fire-and-forget push or outbox | await the effect or assert through a drained queue                                          |
| Randomness           | ids, sorting of equal keys                                         | seed or sort explicitly                                                                     |
| Real I/O             | network, filesystem, env                                           | mock the provider; read env through `src/config`                                            |
| Concurrency          | DB-backed e2e races                                                | deterministic ordering; wait on state, not on time                                          |
| Resource             | timeouts on CI only                                                | lower work per test; never just raise the timeout                                           |

## 3. Act

- **Fix** in the same day: `test(api): stabilise <spec> against <cause>` (or
  `fix(...)` if the product code was wrong; a flaky test often hides a real
  race).
- **Quarantine** only if the fix is not possible today: `it.skip` (or
  `describe.skip`) with a comment linking the backlog line, plus a line in
  tarodan-ops: `backlog.md`, for example
  `- [ ] (P2) tests: <spec> flaky (<cause>) — owner, date` (hand it to the
  orchestrator if you have no hub access).
- Never delete the test, loosen its assertion to pass, or add blind retries.

## 4. Report

The cause with evidence (runs, logs), the fix or the quarantine with its backlog
line, and whether product code was involved.
