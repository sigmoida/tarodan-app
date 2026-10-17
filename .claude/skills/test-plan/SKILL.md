---
name: test-plan
description: Write a risk-based test plan for a change or feature in tarodan-app (levels, cases, critical paths, money and authZ pins, what is out of scope). Use before implementing money, payment, stock, authZ or multi-layer work, or when asked which tests a change needs.
argument-hint: "<feature, branch or diff to plan for>"
---

# Test plan

Target: $ARGUMENTS

Sources: tarodan-ops: `docs/test-strategy.md`, `qa/critical-paths.md`,
`docs/definition-of-done.md`. There is no coverage percentage: every critical
path needs at least one test at the right level.

## 1. Understand the change

- Read the diff or spec (`git diff development...HEAD --stat`, then the files).
- List the behaviours that change and the ones that must not change.
- Mark risk: money/payment, stock, authZ, state machine, concurrency, contract
  visible to mobile, migration, test lane, PII.

## 2. Choose levels

| Level         | Tool                                      | Where                                                                       | Use for                                                                                |
| ------------- | ----------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Unit          | jest (API), vitest (web, admin, packages) | colocated `*.spec.ts` / `*.test.ts`                                         | pure logic, services with mocked Prisma, policies, formatters                          |
| Contract      | jest `*-contract.spec.ts`, `test:api`     | API `src/`, web/admin                                                       | invariants: guard pairing, permission map, cron catalog, schema maps, API export names |
| Integration   | jest                                      | `apps/api/test/integration`                                                 | provider clients (PayTR, Surat)                                                        |
| DB-backed e2e | jest e2e + Postgres/Redis/ES/Mailpit      | `apps/api/test/e2e/*.e2e-spec.ts`, scenarios `test/scenarios/manifest.json` | order, payment, refund, trade flows                                                    |
| Web journey   | Playwright                                | `apps/web/e2e/journeys/jNNN-*.spec.ts` (index `JOURNEYS.md`)                | critical user paths in the browser                                                     |

Mandatory: unit tests for money, payment, stock and authZ logic; a
behaviour-pinning test (amounts, rounding, transitions) before and after any
money change; DB-backed e2e for order, payment, refund and trade flows.

## 3. Write the plan

```markdown
## Test plan: <change>

Risk: <money | authZ | ...> Critical paths touched: <#n from qa/critical-paths.md>
| # | Case | Level | File | Given / when / then | Status |
Edge cases: duplicate callback, double submit, concurrent writers, expired
window, test-lane account, guest user, banned user, old mobile client.
Out of scope: <and why>
Not run locally: <e2e, Playwright> -> who runs them, where
```

Include negative and authZ cases (wrong owner, missing permission, public route
reachable?), idempotency (replay the same event), and the i18n error keys.

## 4. Hand-off

- New or changed critical path -> propose the `qa/critical-paths.md` row.
- Missing levels -> list them as gaps with an owner, or a hub backlog line.
- Implementation goes to the developer agent with the plan; QA reviews the
  tests against it (`write-tests` skill).
