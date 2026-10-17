---
name: write-tests
description: Write or improve tests in tarodan-app (API jest specs, web/admin vitest, contract specs) following the repo's patterns, pinning behaviour rather than implementation. Use when adding behaviour, fixing a bug, closing a test gap or reviewing test quality.
argument-hint: "<file, behaviour or bug to cover>"
---

# Write tests

Target: $ARGUMENTS

## Principles

- Pin **behaviour**, not implementation: inputs, outputs, persisted state,
  emitted events, thrown error keys. Avoid asserting call order or private
  helpers unless the order is the contract (lock order, outbox-before-commit).
- **Bug fix = red test first**, named after the failure
  (`it("does not resurrect a cancelled order when the parcel is picked up")`).
- Money: assert exact amounts and rounding with `Prisma.Decimal` or the kuruş
  value, both sides of every transition, and that a replay changes nothing.
- AuthZ: at least one forbidden case (wrong owner, missing permission, banned
  user) per protected behaviour.
- One behaviour per `it`; descriptive English names; no snapshot tests for logic.

## API (jest, `apps/api`)

- Colocate `<subject>.spec.ts` (or `<subject>-<behaviour>.spec.ts`) next to the
  file. Copy the setup of a neighbouring spec in the same module: Nest testing
  module or direct construction with mocked `PrismaService` (`$transaction`
  mocks call the callback with the same mock).
- Reuse `test/factories/*` and `test/test-utils/*` (personas, time, db) instead
  of hand-built entities. Freeze time explicitly when deadlines matter.
- Specs that read files (migration SQL, sources) anchor with
  `src/common/helpers/app-root.ts`.
- Contract specs (`*-contract.spec.ts`) protect invariants; update one only on
  purpose and say why in the commit.
- Run: `cd apps/api && npx jest <paths> --maxWorkers=2`.

## Web and admin (vitest)

- Colocated `*.test.ts(x)`; pure logic first (parsers, formatters, price,
  phone, status derivations). UI plumbing does not need a test for its own sake.
- Hooks with React Query: render with a fresh `QueryClient` per test; mock the
  `lib/api` module, not axios internals.
- Run: `pnpm --filter @tarodan/web exec vitest run <paths>` (or `@tarodan/admin`).

## Scripts and hooks

`node:test` in `scripts/*.test.mjs`; import the pure functions, never run the
CLI part. Run `node --test scripts/*.test.mjs`.

## Quality checklist

- [ ] Fails without the change (revert locally or reason it through)
- [ ] No sleeps or real network; time and randomness controlled
- [ ] Independent of order and of other tests' data
- [ ] Error cases assert the i18n key, not a translated string
- [ ] Test-lane and guest variants covered where the code branches on them
- [ ] Commit tests with the change (`test(api): ...` only for test-only commits)
