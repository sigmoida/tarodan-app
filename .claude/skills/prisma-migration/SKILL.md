---
name: prisma-migration
description: Create a Prisma schema change and migration in apps/api safely (additive, sorted after the latest folder, never editing applied ones, backfill as a maintenance script, runbook entry). Use for any schema.prisma change or data backfill.
argument-hint: "<what changes in the schema>"
---

# Prisma migration

Change: $ARGUMENTS

Read `apps/api/prisma/CLAUDE.md` first. Schema work is senior (Opus) work.

## Preflight

- Latest applied folders: !`ls apps/api/prisma/migrations | tail -4`
- Local DB must be the dev database (`tarodan` / `tarodan_*`); never point
  `DATABASE_URL` at staging or production.

## Steps

1. **Edit `apps/api/prisma/schema.prisma`.**
   - Additive and backward compatible: new columns nullable or defaulted; the
     old image and the live mobile version must keep working during deploy.
     Removals and renames ship later in their own release.
   - `///` comment on every non-obvious column (why it exists).
   - Money is `Decimal`; financial and audit relations use `onDelete: Restrict`.
2. **Generate the migration** against the local DB:

   ```bash
   pnpm docker:up                                  # if postgres is not running
   pnpm --filter @tarodan/api exec prisma migrate dev --name <snake_case_description>
   pnpm db:generate
   ```

   Check the folder name sorts after every existing folder
   (`YYYYMMDDHHMMSS_<name>`). Open `migration.sql`, add a short header comment
   (why, safe on live data?), and remove anything destructive you did not intend.

3. **Never edit an applied migration** (on `origin/development`,
   `origin/master` or local `development`); the PreToolUse hook blocks it. Fix
   forward with a new folder. Never touch `migration_lock.toml`.
4. **Backfills are not schema migrations.** Write
   `apps/api/maintenance/<verb>-<thing>.ts`: idempotent, a dry-run mode, a
   `package.json` entry (`backfill:prod:<thing>`), and include it in
   `tsconfig.seed.json` if it is outside `maintenance/**`.
5. **Runbook:** add a one-off section to `docs/OPERATIONS.md` with the dry-run
   and apply commands and the order relative to the deploy.
6. **Pin load-bearing SQL** (triggers, guard functions, renamed maps) with a
   spec that reads the migration through `src/common/helpers/app-root.ts`.
7. **Test lane:** a new external side effect must be gated on `isTest`.
8. **Verify:**

   ```bash
   pnpm --filter @tarodan/api typecheck
   cd apps/api && npx jest <touched specs> --maxWorkers=2
   ```

9. Commit schema + migration (+ spec) together, the backfill script
   separately; the body states the rollback or backfill plan and whether the
   live mobile version is affected (tarodan-ops: `compat.md`). If the response
   shape changes for mobile, add a contract delta.
