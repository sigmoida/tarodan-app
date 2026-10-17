---
name: verify
description: Run the right local checks for the files changed on the current branch in tarodan-app (typecheck, lint, targeted tests), sequentially and with --maxWorkers=2, and report the results honestly. Use before committing, before handing work over, or when asked to verify.
argument-hint: "[base ref, default development]"
allowed-tools:
  - Read
  - Grep
  - Bash(git status *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git show *)
  - Bash(git rev-parse *)
  - Bash(git branch --show-current)
  - Bash(pnpm verify:push)
  - Bash(pnpm --filter @tarodan/api typecheck)
  - Bash(pnpm --filter @tarodan/web typecheck)
  - Bash(pnpm --filter @tarodan/admin typecheck)
  - Bash(pnpm --filter @tarodan/ui typecheck)
  - Bash(pnpm --filter @tarodan/types typecheck)
  - Bash(pnpm --filter @tarodan/shared typecheck)
  - Bash(pnpm --filter @tarodan/design-tokens typecheck)
  - Bash(pnpm --filter @tarodan/i18n typecheck)
  - Bash(pnpm --filter @tarodan/api lint)
  - Bash(pnpm --filter @tarodan/web lint)
  - Bash(pnpm --filter @tarodan/admin lint)
  - Bash(pnpm --filter @tarodan/ui lint)
  - Bash(pnpm --filter @tarodan/web test:api)
  - Bash(pnpm --filter @tarodan/admin test:api)
  - Bash(pnpm --filter @tarodan/web exec vitest run *)
  - Bash(pnpm --filter @tarodan/admin exec vitest run *)
  - Bash(pnpm --filter @tarodan/i18n codegen)
  - Bash(pnpm --filter @tarodan/i18n build)
  - Bash(pnpm --filter @tarodan/types build)
  - Bash(npx jest *)
  - Bash(node --test scripts/*.test.mjs)
  - Bash(npx prettier --check *)
  - Bash(npx eslint *)
---

# Verify

Base ref (default `development`): $ARGUMENTS

## Changed files

- Committed on this branch: !`git diff --name-only development...HEAD`
- Uncommitted: !`git status --porcelain`

## Rules

- One heavy command at a time (one `tsc`, one jest); 16 GB machines froze with
  parallel suites. Never the full suite here; CI runs it.
- Only the tests for what changed, with `--maxWorkers=2`.
- No docker, dev servers, databases or e2e unless the task says so.
- Read the output, not the exit code (pnpm can exit 0 on failures). Count lint
  **errors**; warnings are backlog unless you added them.

## What to run

| Changed                                           | Run                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/**`                                     | `pnpm --filter @tarodan/api typecheck`; `pnpm --filter @tarodan/api lint`; `cd apps/api && npx jest <changed or related specs> --maxWorkers=2`                                              |
| `apps/web/**`                                     | `pnpm --filter @tarodan/web typecheck`; `pnpm --filter @tarodan/web lint`; `pnpm --filter @tarodan/web exec vitest run <tests>`; `pnpm --filter @tarodan/web test:api` if `lib/api` changed |
| `apps/admin/**`                                   | same with `@tarodan/admin`                                                                                                                                                                  |
| `packages/i18n/**`                                | `pnpm --filter @tarodan/i18n typecheck`; `pnpm --filter @tarodan/i18n build`; then typecheck web/admin                                                                                      |
| `packages/types/**`                               | `pnpm --filter @tarodan/types build`; typecheck api, web, admin                                                                                                                             |
| `packages/ui/**`, `design-tokens/**`, `shared/**` | that package's typecheck; typecheck web and admin                                                                                                                                           |
| `apps/api/prisma/**`                              | `pnpm db:generate`; api typecheck; migration-reading specs                                                                                                                                  |
| `scripts/**`                                      | `node --test scripts/*.test.mjs`                                                                                                                                                            |
| `.claude/hooks/**`                                | run the hook with sample stdin JSON                                                                                                                                                         |
| any                                               | `npx prettier --check <changed files>`; `npx eslint <changed ts/tsx>`                                                                                                                       |

Finding related API specs: colocated `*.spec.ts` next to each changed file, plus
`git grep -l "<ChangedClass>" apps/api/src -- '*.spec.ts'`.

The push-equivalent check is `pnpm verify:push` (affected apps' typecheck).
`pnpm verify:push --tests` adds related specs but uses many cores; run it only
when asked.

## Report

A table of each command with PASS/FAIL and counts (errors, failed tests), what
you fixed, what you did **not** run and why, and any pre-existing failure
labelled as such.
