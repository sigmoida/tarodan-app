# Prisma: schema, migrations, seeds

`schema.prisma`, `migrations/`, the seed layers and the post-deploy scripts in
`apps/api/maintenance/`. API rules: [../CLAUDE.md](../CLAUDE.md). Schema
changes are senior work (Opus) and follow the "Migration" section of
tarodan-ops: `docs/definition-of-done.md`.

## Schema

- Every column that is not self-evident carries a `///` comment saying **why**
  it exists (the `Order` model is the standard): snapshots, claim stamps and
  back-compat totals are documented at the column.
- `@map` snake_case columns, `@@map` tables. Money is `Decimal`, never `Float`.
- Think before `onDelete: Cascade`: anything financial or audit-relevant is
  `Restrict`.
- Some invariants are enforced in the database (triggers and functions):
  append-only `ledger_entries`, `consent_records` and refund financial
  components, `is_test` stamping, code generators. Keep them in mind when a
  write "mysteriously" fails, and never drop one as a side effect.
- Provider-neutral model names may keep historical table names through `@map`
  (`FiscalInvoice` -> `elogo_invoices`); a spec pins these.

## Migrations

- Create with `pnpm db:migrate` (`prisma migrate dev`) against the local DB.
  Folder name `YYYYMMDDHHMMSS_snake_case_description`; a new folder must
  **sort after every existing one**. A back-dated folder is skipped or breaks
  `migrate deploy` on environments that already applied later ones.
- **Never edit or rename an applied migration.** Prisma checksums applied
  migrations; fix forward with a new folder. A folder already on
  `origin/development`, `origin/master` or local `development` counts as applied
  (the Claude Code PreToolUse hook refuses those edits). `migration_lock.toml`
  is Prisma's.
- **Additive and backward compatible.** The old image keeps running during a
  deploy and the live mobile version keeps calling the API: new columns are
  nullable or defaulted; removals come later, in their own release.
- **No data backfills inside schema migrations.** Write a `maintenance/` script
  (see below). Start the SQL with a short comment block: why, and whether it is
  safe on live data.
- If a migration's content is load-bearing (a trigger, a renamed map, a guard
  function), add a spec that reads its SQL, anchored with
  `src/common/helpers/app-root.ts` (examples:
  `modules/invoicing/helpers/fiscal-invoices-migration.spec.ts`,
  `modules/account-lane/test-lane-migrations.spec.ts`).
- The commit or PR body carries the rollback or backfill plan.

## Test lane

Production hosts an isolated test lane for `User.isTestAccount` accounts (App
Review, mobile QA; `docs/OPERATIONS.md`, "Canlıda test şeridi"). A DB trigger
stamps `is_test` on orders, payments, trades and ledger rows at insert.

- Any new external side effect (money, invoice, cargo, mail to staff) must be
  gated on `isTest`; lane rules live in `src/modules/account-lane/`, and reports
  exclude the lane through `account-lane/live-lane.where.ts`.
- The test-lane migrations and the purge-gate function
  (`prevent_refund_financial_component_mutation`) are pinned by
  `test-lane-migrations.spec.ts`: a later migration must not redefine that
  function without keeping the gate.

## Deploy

- `apps/api/entrypoint.sh` runs `prisma migrate deploy` and then the reference
  seed on every boot of every role except `worker`.
- The staging refresh from production refuses when production has a migration
  the staging image lacks.
- Locally: `pnpm db:migrate:deploy`, `pnpm db:generate`. Test DB:
  `pnpm --filter @tarodan/api test:e2e:setup` (uses `.env.test`).

## Seed layers

| Layer     | File                                                             | Runs                                                                         |
| --------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Reference | `seed-production.ts`                                             | every API boot; upserts with an empty `update`, never overwrites admin edits |
| Launch    | `seed-launch.ts` (+ `seed-launch-core.ts`, `data/launch/*.json`) | manually, once per runbook; **reset-time only, never on a live DB**          |
| UAT       | `seed-uat.ts`, `uat/mask-database.ts`                            | staging reset and refresh workflows                                          |
| Demo      | `seed.ts` (+ `seed-commerce.ts`, ...)                            | local only (`pnpm dev:seed`)                                                 |

- New reference data goes into the right layer, never into an existing dump.
  Commission rules are deliberately not in the reference seed.
- Production paths must never import the demo seed
  (`common/helpers/seed-independence.spec.ts`, `release-production-bootstrap.spec.ts`).
- Seeds and maintenance scripts compile with `build:seed` into `dist-seed/`;
  `:prod` scripts and the Docker boot expect those paths.

## Post-deploy scripts

`apps/api/maintenance/*.ts`, run from `dist-seed/maintenance/*.js` on the host
(`pnpm --filter @tarodan/api <script>` locally after `build:seed`).

- Idempotent and re-runnable. **Dry run first, always.** The flag convention is
  not uniform: some scripts write by default and take `--dry-run`, others are
  dry by default and need `--apply`. Read the script header before running it.
- Every new script gets a runbook entry in `docs/OPERATIONS.md` (one-off
  sections) with the dry-run and apply commands, and a `package.json` entry.
- Money-moving scripts (`settle-seller-fault-residuals.ts`) require `--apply`
  and senior review.
