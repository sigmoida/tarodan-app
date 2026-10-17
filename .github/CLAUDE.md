# .github/

CI/CD for tarodan-app. Repo rules: [root CLAUDE.md](../CLAUDE.md). Full
pipeline description (Turkish): `docs/OPERATIONS.md` section 4. Production
writes need the user's approval; the production freeze is active (tarodan-ops:
`decisions/0010-production-freeze.md`).

## Workflow map

| Workflow                                                                                                               | Trigger                           | Does                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify.yml` (**Verify**)                                                                                              | `workflow_call`                   | The reusable gate. Jobs `Typecheck & lint` (`--group static`), `Unit tests` (`--group unit`), `Build & audit` (`--group release`, only with `full: true`). Same groups as `pnpm verify:ci`. |
| `deploy-staging.yml` (**Deploy Staging**)                                                                              | push to `development`             | Staging gate (static only) -> deploys apps changed since the last successful run to Coolify staging and waits for the result.                                                               |
| `development-tests.yml` (**Development Tests**)                                                                        | push to `development`             | Unit group, **advisory**: nothing waits for it; fix red forward. Separate workflow so a red unit run never becomes the deploy diff base.                                                    |
| `pr-checks.yml` (**PR Checks**)                                                                                        | PRs to `development`, `master`    | `Verify` job: static + unit on development (advisory), the full gate on master.                                                                                                             |
| `master-source-guard.yml`                                                                                              | `pull_request_target` to `master` | Allows PRs into `master` only from `development` or `hotfix/*`. Reads event metadata only.                                                                                                  |
| `api-e2e.yml` (**API E2E**)                                                                                            | PRs to `master`, manual           | API e2e + scenarios against service containers. Advisory until proven green.                                                                                                                |
| `deploy-production.yml` (**Release Production**)                                                                       | push to `master`                  | Re-runs the full gate on the exact commit, deploys changed apps to Coolify production, then tags the commit `app-YYYY.MM.DD-N`.                                                             |
| `staging-reset.yml`, `staging-refresh-from-prod.yml`, `staging-run-reference-seed.yml`, `staging-run-uat-accounts.yml` | manual (`staging` environment)    | Staging data operations over SSH on the Coolify host, with staging fingerprint guards.                                                                                                      |
| `production-reset.yml`                                                                                                 | manual (`production` environment) | Pre-launch production wipe. Never run without explicit user approval.                                                                                                                       |

Composite actions: `actions/setup-workspace` (pnpm, node, install),
`actions/prisma-generate`, `actions/deploy-targets` (diff against the last
successful run of the calling workflow), `actions/coolify-deploy` (trigger,
expected-commit check, wait for the result).

## Gates

- **development is light:** the staging deploy waits only for typecheck + lint;
  unit tests are advisory. **master is complete:** the PR runs the full gate
  and Release Production repeats it.
- No ruleset protects `master` yet (`docs/OPERATIONS.md` section 4, "GitHub
  ayarları"). The planned `master` ruleset (manual GitHub setting) will
  require these checks:
  - `Verify / Typecheck & lint`
  - `Verify / Unit tests`
  - `Verify / Build & audit`
  - later `Master source guard` and `API e2e`

  **Never rename these jobs** without updating the ruleset, or master PRs wait
  forever. No path filters on required checks.

- Caller job names differ on purpose (`Staging gate`, `Release gate`, ...) so a
  development-level run never satisfies a master check.
- turbo caching is on in development gates and off in the full gate.

## Deploy

- Coolify Auto Deploy is disabled; these workflows are the only trigger.
  Coolify builds the branch HEAD, so the deploy refuses when the branch moved
  past the verified commit. A newer staging push cancels an older run;
  production runs queue.
- Deploy targets are the apps (api, web, admin) changed since the last
  successful run, so cancelled or failed runs still ship later.
- After a successful production rollout, Release Production pushes the
  annotated tag `app-YYYY.MM.DD-N` (Europe/Istanbul date, `N` = highest of the
  day + 1) on the deployed commit. This is the only job with
  `contents: write`. No tag when nothing was deployed; a commit that already
  has an `app-*` tag keeps it. Format: tarodan-ops `docs/versioning.md`.
- Secrets used by deploys: `COOLIFY_URL`, `COOLIFY_TOKEN`,
  `COOLIFY_STAGING_UUIDS`, `COOLIFY_PROD_UUIDS`; data workflows use the shared
  `SERVER_*` SSH secrets and their environment's seed secrets. Gates use **no**
  secrets (providers are mocked; `NEXT_PUBLIC_*` values are public placeholders).

## Rules for workflow changes

- Keep `permissions` minimal (`contents: read` by default), pin actions to a
  version tag as today, pass
  untrusted values through `env:`, never `${{ }}` inside `run:`.
- A new check goes into `scripts/verify-local.mjs` first, so local and CI stay
  identical.
- Run `actionlint` (config in `actionlint.yaml`) on changed workflows.
- Commit as `ci: ...`; never trigger production workflows or
  change Coolify production env without the user's explicit approval.
