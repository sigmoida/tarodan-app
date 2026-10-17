---
name: e2e-journey
description: Add or update a Playwright web journey (apps/web/e2e/journeys) or a DB-backed API e2e spec (apps/api/test/e2e) for a critical user path, and run it locally in isolation. Use when a critical path lacks an end-to-end test or a journey breaks.
argument-hint: "<journey id or user path>"
---

# E2E journey

Path: $ARGUMENTS

E2E runs need docker and running apps, so only do this when the task asks for
it. They are not part of the development gate.

## Web journeys (Playwright)

- Index: `apps/web/e2e/journeys/JOURNEYS.md` (J1..J137, status column). Files
  are `jNNN-<kebab-description>.spec.ts`; take the next free number and add the
  row to the index.
- Shared helpers: `apps/web/e2e/support/helpers.ts` (`USERS`, `login`,
  `apiLogin`, `apiBuyAndPay`, `signPaytrCallback`), `support/db.ts`,
  `support/mail.ts`. Reuse them; never hardcode credentials beyond the seeded
  demo accounts.
- Selectors: roles and accessible names, bilingual regexes
  (`/sepete ekle|add to cart/i`), never CSS classes.
- Each journey must pass from a seed-clean state on its own.

Run:

```bash
pnpm docker:up && pnpm db:reset                 # seeded users and products
# API with PAYMENT_BYPASS=true for payment journeys
cd apps/web && npx playwright test journeys/j137-sepet-ve-checkout-sadelesiyor.spec.ts
node apps/web/e2e/run-each.mjs j050 j051        # isolated runs, resets state per journey
```

## API e2e (jest + Postgres, Redis, ES, Mailpit)

- Specs: `apps/api/test/e2e/<area>.e2e-spec.ts`; scenario catalogue
  `apps/api/test/scenarios/manifest.json`. Build data with `test/factories` and
  `test/test-utils` (`create-app.ts`, `personas.ts`, `scenario.ts`, `time.ts`).
- Every external provider is mocked or stubbed; `.env.test` has test-only values.

Run:

```bash
pnpm docker:up
pnpm --filter @tarodan/api test:e2e:setup       # migrate the test DB
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/e2e/<file>
node scripts/verify-local.mjs ci --group e2e    # the full CI e2e group
```

## Done

- The journey covers the critical path end to end, including the money outcome
  where relevant.
- Update tarodan-ops: `qa/critical-paths.md` (hand the row to the orchestrator
  if you have no hub access).
- A flaky run is handled with the `flaky-triage` skill, never by retrying.
