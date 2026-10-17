# scripts/

Repo-level Node scripts: local verification, the pre-push hook, affected-app
detection, the dependency-audit gate and the mobile API doc generator. Repo
rules: [root CLAUDE.md](../CLAUDE.md). CI behaviour: `docs/OPERATIONS.md`
section 4 and [.github/CLAUDE.md](../.github/CLAUDE.md).

## Map

| Script                                               | Role                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-local.mjs`                                   | **The single definition of the gates.** Modes `watch`, `push`, `ci`, `release`. `ci --group <name>` (static, unit, release or e2e) is exactly what `.github/workflows/verify.yml` runs per job; `pnpm verify:ci` = all groups. Reports go to `.git/tarodan-test-results/`.                                                                                                      |
| `pre-push-verify.mjs`                                | `.husky/pre-push`. Checks branch names where they are introduced (a new remote branch, or a local branch pushed into `development`/`master`); for `development` pushes runs `verify-local.mjs push` (affected apps' typecheck + web/admin API contract, sequential, no jest) after asserting a clean tree equal to the pushed commit; for `master` only prints the PR reminder. |
| `detect-affected-apps.mjs`                           | Maps changed files to affected apps through the workspace graph (a package change affects its consumers). Used by the push gate and CI deploy targets.                                                                                                                                                                                                                          |
| `push-verification-cache.mjs`                        | Caches a passed push check per git **tree** in the common git dir, so retried pushes, merge commits of verified branches and other worktrees skip work.                                                                                                                                                                                                                         |
| `check-dependency-audit.mjs`                         | Reads `pnpm audit --json` (`pnpm audit:prod`) and applies `security/dependency-audit-allowlist.json`; entries expire and the gate fails closed.                                                                                                                                                                                                                                 |
| `generate-mobile-api-doc.mjs`                        | `pnpm docs:mobile-api` writes `docs/mobile-api-reference.html` from the controllers and DTOs. The output is generated: change the generator, never the HTML.                                                                                                                                                                                                                    |
| `test-summary.mjs`, `jest-live-summary-reporter.cjs` | Test run summaries for the verification reports.                                                                                                                                                                                                                                                                                                                                |
| `prepare-local-test-db.mjs`                          | Local test database for e2e runs.                                                                                                                                                                                                                                                                                                                                               |
| `sync-brand-assets.mjs`                              | Writes `@tarodan/brand` marks into web/admin `public/` at dev/build (gitignored output).                                                                                                                                                                                                                                                                                        |

## Commands

```bash
pnpm verify:push            # what the hook runs (affected typecheck)
pnpm verify:push --tests    # + related API specs and web/admin unit suites
pnpm verify:quick           # development CI: static + unit groups (all cores)
pnpm verify:ci              # the master gate (+ build + audit)
pnpm verify:release:local   # optional rehearsal with docker, e2e, Playwright
pnpm test:verification-tools
node --test scripts/*.test.mjs
```

## Rules

- Every script with logic has a colocated `*.test.mjs` (`node:test`); the
  `static` CI group runs them. Change behaviour together with its test.
- Export pure functions and keep the CLI part behind a direct-execution check,
  as `pre-push-verify.mjs` does, so tests import without side effects.
- The gate content is defined once, in `verify-local.mjs`. Never add a check to
  a workflow that the local `ci` mode does not run, or the reverse.
- The push hook stays fast and typecheck-only (jest in the hook once took 8 min
  and pushed people to `--no-verify`). Heavier checks go to CI.
- Keep scripts dependency-free (Node built-ins, ESM `.mjs`) and runnable from
  any worktree; resolve paths from the script location, not the cwd.
