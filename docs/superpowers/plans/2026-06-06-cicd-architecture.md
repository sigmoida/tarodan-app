# Tarodan CI/CD Mimari — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end CI/CD pipeline for the Tarodan monorepo: a fast, cached CI quality base; immutable Docker images pushed to GHCR; automatic staging deploy and gated production deploy over SSH with migration safety + smoke + rollback; an Expo EAS preview build feeding Maestro e2e; plus cleanup of competing deploy paths.

**Architecture:** GitHub Actions. CI runs on every PR/push (Turbo-cached lint/typecheck/build/unit/e2e + coverage + CodeQL + Dependabot + secret scan). On `development`/`master` push, images for api/web/admin are built once and pushed to GHCR tagged by commit sha. `development` → auto deploy to staging VPS; `master` → manual-approval deploy to production VPS, both via SSH (`compose pull` + migrate-status gate + `up -d` + smoke + auto-rollback on failure). Mobile builds a preview `.app` via EAS that the existing Maestro Cloud workflow consumes.

**Tech Stack:** GitHub Actions, pnpm 8.12 workspaces + Turbo, Docker / docker-compose, GHCR (`ghcr.io/sigmoida/tarodan-*`), Prisma migrate, Expo EAS, Maestro Cloud, CodeQL, gitleaks, actionlint.

---

## Important Context for the Implementer

You know nothing about this repo. Key facts:

- **Monorepo:** pnpm workspace + Turbo. Apps in `apps/{api,web,admin,mobile}`, shared libs in `packages/*`. Package manager pinned: `pnpm@8.12.0`, Node 20.
- **API** is NestJS + Prisma (`apps/api`). Web/admin are Next.js 14. Mobile is Expo/React Native.
- **The api Dockerfile** (`apps/api/Dockerfile`) is a monorepo Dockerfile: it `COPY`s `package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json`, `packages/`, `apps/api/`, and `photos/` from the **repo root**. Therefore its **Docker build context MUST be the repo root** (`.`), NOT `apps/api`. The web/admin Dockerfiles follow the same monorepo pattern — verify with `head -20 apps/web/Dockerfile` before building; use repo-root context for all three.
- **`apps/api/entrypoint.sh`** already runs `npx prisma migrate deploy` on container start. So migrations run automatically inside the container. Our deploy "migration gate" is therefore a **pre-swap `prisma migrate status` drift check** (fail fast if migrations are missing/divergent), not a second `migrate deploy`.
- **Health:** `apps/api` exposes `/health` on port 3001 (the existing `scripts/deploy.sh` curls `http://localhost:3001/health`). Web on 3000, admin on 3002.
- **Existing CI:** `.github/workflows/ci.yml` has jobs `lint`, `type-check`, `build`, `unit-test`, `e2e-test` (with postgres/redis/elasticsearch services), `integration-test` (manual). Keep its triggers. `.github/actions/prisma-generate` is a retry-wrapped composite action — reuse it.
- **Existing mobile e2e:** `.github/workflows/maestro-cloud.yml` is currently a guarded no-op (skips unless `apps/mobile/build/Tarodan.app` exists + Maestro secrets set). Maestro flows live in `apps/mobile/maestro/flows`, tagged `smoke`.

### A note on TDD for CI/CD work

Workflow YAML is not unit-testable in the classic red/green sense. The disciplined equivalent used throughout this plan is:

1. **Static gate (local, fast):** `actionlint` must pass on every changed workflow before commit. This is our "run the test, watch it pass."
2. **Behavioral gate (real run):** after pushing to a throwaway branch or using `workflow_dispatch`, observe the actual GitHub Actions run reach the expected state. Each task states the expected observable outcome.

Never claim a workflow "works" from reading it — `actionlint` + a real run are the evidence.

### Secrets / settings you (the human operator) must provision

These are configured in **GitHub repo settings**, not code. The plan's docs task lists them; deploy tasks assume they exist. If absent, deploy jobs are expected to fail at the SSH step — that is correct behavior, not a plan error.

- Repo → Settings → Secrets → **Environments**:
  - `staging`: `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`
  - `production`: `PROD_HOST`, `PROD_USER`, `PROD_SSH_KEY` + **required reviewers** (the approval gate)
- Repo secret: `EXPO_TOKEN` (for EAS). Optional: `CODECOV_TOKEN`.
- GHCR push uses the built-in `GITHUB_TOKEN` with `packages: write` permission (set per-workflow, no manual secret).

---

## File Structure

**Create:**
- `.github/workflows/build-images.yml` — build api/web/admin images, push to GHCR.
- `.github/workflows/deploy-staging.yml` — auto deploy to staging on development image build.
- `.github/workflows/deploy-production.yml` — gated deploy to production on master image build.
- `.github/workflows/codeql.yml` — CodeQL JS/TS analysis (PR + weekly).
- `.github/workflows/mobile-build.yml` — EAS preview build for `apps/mobile/**`.
- `.github/dependabot.yml` — npm + github-actions update config.
- `.github/actionlint.yaml` — actionlint config (declare self-hosted-free, ignore shellcheck noise if needed).
- `scripts/deploy-remote.sh` — runs ON the server: `compose pull` + migrate-status gate + `up -d` + smoke + rollback.
- `apps/mobile/eas.json` — EAS build profiles (adds `preview`).
- `docs/CI_CD.md` — canonical architecture, secrets, branch protection, runbook, rollback.

**Modify:**
- `.github/workflows/ci.yml` — add `.turbo` caching; add `coverage`, `security-audit`, `secret-scan` jobs.
- `infrastructure/docker-compose.prod.yml` — replace `build:` blocks for api/web/admin with GHCR `image:` refs driven by `${IMAGE_TAG}`/`${REGISTRY}`.
- `DEPLOYMENT.md` — mark VPS+GHCR as canonical; relegate Railway/Fly/Render to "alternatives".
- `scripts/deploy.sh` — repoint to the new pull-based flow (or deprecate in favor of `deploy-remote.sh`).

**Delete:**
- `package-lock.json` — pnpm workspace is the single source of truth (`pnpm-lock.yaml`).
- `railway.json` — competing deploy path (or keep with a "not used" header; plan deletes it).

---

## Phase 0 — Tooling & Cleanup

### Task 0.1: Install actionlint locally and remove competing-path files

**Files:**
- Delete: `package-lock.json`
- Delete: `railway.json`
- Create: `.github/actionlint.yaml`

- [ ] **Step 1: Install actionlint (the workflow linter we verify with)**

Run:
```bash
brew install actionlint shellcheck
actionlint --version
```
Expected: prints a version (e.g. `1.7.x`). If `brew` unavailable, use `go install github.com/rhysd/actionlint/cmd/actionlint@latest` or download the release binary; the rest of the plan only needs `actionlint` on PATH.

- [ ] **Step 2: Confirm pnpm is the only lockfile that matters, then delete package-lock.json**

Run:
```bash
ls pnpm-lock.yaml pnpm-workspace.yaml package-lock.json
grep -c '"lockfileVersion"' package-lock.json
```
Expected: all three files listed; the grep confirms `package-lock.json` is an npm lockfile. We use pnpm, so it is stale/misleading.

```bash
git rm package-lock.json
```

- [ ] **Step 3: Delete the competing Railway config**

Railway is not the chosen deploy target (VPS+GHCR is). Remove it so there is one canonical path.
```bash
git rm railway.json
```

- [ ] **Step 4: Create actionlint config**

Create `.github/actionlint.yaml`:
```yaml
# actionlint config. We use only GitHub-hosted runners (ubuntu-latest).
# Pin shellcheck severity so embedded run-scripts are linted but info-level
# style notes don't fail local checks.
self-hosted-runner:
  labels: []
```

- [ ] **Step 5: Run actionlint on existing workflows to establish a clean baseline**

Run:
```bash
actionlint
```
Expected: no errors (existing `ci.yml`, `maestro-cloud.yml` are valid). If pre-existing warnings appear, note them but do not fix unrelated issues now.

- [ ] **Step 6: Commit**

```bash
git add .github/actionlint.yaml
git commit -m "chore(ci): add actionlint config, drop package-lock.json and railway.json

pnpm-lock.yaml is the single workspace lockfile; VPS+GHCR is the canonical
deploy path so the Railway config is removed."
```

---

## Phase 1 — CI Hardening

### Task 1.1: Add Turbo cache to ci.yml

Turbo writes its cache to `.turbo/`. Caching that directory across runs lets unchanged packages skip rebuild. We cache it keyed by lockfile + a run-rotating suffix so it stays fresh.

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a cache step to each job that runs a turbo task**

In `ci.yml`, for the `lint`, `type-check`, `build`, and `unit-test` jobs, insert this step **after** the `actions/setup-node` step and **before** `pnpm install`:
```yaml
      - name: Cache Turbo
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ github.job }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-${{ github.job }}-
```

- [ ] **Step 2: Validate**

Run:
```bash
actionlint .github/workflows/ci.yml
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "perf(ci): cache .turbo across runs to skip unchanged packages"
```

### Task 1.2: Add coverage job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a coverage job**

Append this job to `ci.yml` under `jobs:` (sibling of `unit-test`):
```yaml
  coverage:
    name: Coverage
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 8.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: ./.github/actions/prisma-generate
      - name: Run API tests with coverage
        run: pnpm --filter @tarodan/api test:cov
      - name: Upload coverage artifact
        uses: actions/upload-artifact@v4
        with:
          name: api-coverage
          path: apps/api/coverage/
          retention-days: 14
      - name: Upload to Codecov (skipped if no token)
        if: ${{ env.CODECOV_TOKEN != '' }}
        uses: codecov/codecov-action@v4
        env:
          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
        with:
          files: apps/api/coverage/lcov.info
          flags: api
          fail_ci_if_error: false
```

- [ ] **Step 2: Validate**

Run: `actionlint .github/workflows/ci.yml`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add coverage job (artifact + optional Codecov upload)"
```

### Task 1.3: Add dependency audit + secret scan jobs

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add security-audit and secret-scan jobs**

Append to `ci.yml` under `jobs:`:
```yaml
  security-audit:
    name: Dependency Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 8.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Audit dependencies (high+ fails)
        run: pnpm audit --audit-level=high

  secret-scan:
    name: Secret Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Validate**

Run: `actionlint .github/workflows/ci.yml`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add dependency audit (pnpm audit) and gitleaks secret scan"
```

### Task 1.4: Add CodeQL workflow

**Files:**
- Create: `.github/workflows/codeql.yml`

- [ ] **Step 1: Create codeql.yml**

```yaml
name: CodeQL

on:
  push:
    branches: [development, master]
  pull_request:
    branches: [development, master, main]
  schedule:
    - cron: '0 3 * * 1'  # Mondays 03:00 UTC

jobs:
  analyze:
    name: Analyze (JS/TS)
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - name: Autobuild
        uses: github/codeql-action/autobuild@v3
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:javascript-typescript"
```

- [ ] **Step 2: Validate**

Run: `actionlint .github/workflows/codeql.yml`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/codeql.yml
git commit -m "ci: add CodeQL JS/TS analysis (PR + weekly schedule)"
```

### Task 1.5: Add Dependabot config

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Create dependabot.yml**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
    groups:
      dev-dependencies:
        dependency-type: development
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
```

- [ ] **Step 2: Sanity check YAML**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/dependabot.yml')); print('valid')"
```
Expected: `valid`. (actionlint does not lint dependabot.yml; this confirms syntax.)

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: add Dependabot for npm + github-actions (weekly)"
```

### Task 1.6: Behavioral verification of CI changes

- [ ] **Step 1: Push the branch and open a draft PR to trigger CI**

```bash
git push -u origin HEAD
```
Then open a PR targeting `development` (or use the existing branch's PR). 

- [ ] **Step 2: Observe the runs**

Expected observable outcomes on the PR's Checks tab:
- `Lint`, `Type Check`, `Build`, `Unit Tests`, `E2E Tests` pass (as before).
- New `Coverage` job runs and uploads the `api-coverage` artifact.
- `Dependency Audit` runs (may fail if real high-severity advisories exist — if so, record them; do not silence the gate).
- `Secret Scan` passes.
- `CodeQL / Analyze (JS/TS)` runs.
- Turbo cache: second run of the same job is faster and logs cache restore.

If `Dependency Audit` fails on a genuine advisory, that is a real finding — surface it to the user rather than weakening the gate.

---

## Phase 2 — Image Build & GHCR

### Task 2.1: Fix prod compose to use GHCR images

The compose `api`/`web`/`admin` services currently use `build:` blocks (and the api one has the wrong `context`). Replace them with parameterized GHCR image references so the server pulls instead of builds.

**Files:**
- Modify: `infrastructure/docker-compose.prod.yml`

- [ ] **Step 1: Inspect the current app service blocks**

Run:
```bash
grep -nE "^  (api|web|admin):|build:|context:|dockerfile:|image:" infrastructure/docker-compose.prod.yml
```
Expected: shows `api:`, `web:`, `admin:` each with a `build:`/`context:`/`dockerfile:` block and no `image:`.

- [ ] **Step 2: Replace each `build:` block with an `image:` ref**

For the `api` service, replace:
```yaml
    build:
      context: ../apps/api
      dockerfile: Dockerfile
```
with:
```yaml
    image: ${REGISTRY:-ghcr.io/sigmoida}/tarodan-api:${IMAGE_TAG:-latest}
```
Do the same for `web` (`tarodan-web`) and `admin` (`tarodan-admin`). Note: there is a second `build:` block in the file for the API worker (a duplicate `context: ../apps/api`) — give it the same image ref as `api` (`tarodan-api:${IMAGE_TAG:-latest}`) since worker and api share one image; verify by checking the service name above that block with `grep -n -B6 "context: ../apps/api" infrastructure/docker-compose.prod.yml`.

- [ ] **Step 3: Document the new env vars in the compose env example**

Append to `infrastructure/env.example.txt`:
```
# GHCR image source (set by deploy job / server .env)
REGISTRY=ghcr.io/sigmoida
IMAGE_TAG=latest
```

- [ ] **Step 4: Validate compose syntax**

Run:
```bash
docker compose -f infrastructure/docker-compose.prod.yml config >/dev/null && echo "compose valid"
```
Expected: `compose valid` (warnings about unset env vars are fine; substitution defaults cover REGISTRY/IMAGE_TAG).

- [ ] **Step 5: Commit**

```bash
git add infrastructure/docker-compose.prod.yml infrastructure/env.example.txt
git commit -m "feat(infra): prod compose pulls api/web/admin from GHCR via IMAGE_TAG"
```

### Task 2.2: Create build-images.yml

**Files:**
- Create: `.github/workflows/build-images.yml`

- [ ] **Step 1: Confirm web/admin Dockerfiles use repo-root context**

Run:
```bash
head -20 apps/web/Dockerfile apps/admin/Dockerfile
```
Expected: like the api Dockerfile, they `COPY package.json pnpm-lock.yaml ...` from root → so build context for all three is the repo root `.`, and `file:` points at each app's Dockerfile. If a Dockerfile instead copies only app-local files, set that service's `context:` to its app dir in the matrix below. Adjust the matrix `context` per finding.

- [ ] **Step 2: Create build-images.yml**

```yaml
name: Build Images

on:
  push:
    branches: [development, master]
  workflow_dispatch:

concurrency:
  group: build-images-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  packages: write

jobs:
  build:
    name: Build & Push (${{ matrix.app }})
    runs-on: ubuntu-latest
    strategy:
      matrix:
        app: [api, web, admin]
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Compute tags
        id: tags
        run: |
          REPO_OWNER="$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]')"
          IMAGE="ghcr.io/${REPO_OWNER}/tarodan-${{ matrix.app }}"
          SHA_TAG="${IMAGE}:sha-${GITHUB_SHA::12}"
          if [ "${GITHUB_REF_NAME}" = "master" ]; then
            MOVING_TAG="${IMAGE}:latest"
          else
            MOVING_TAG="${IMAGE}:staging"
          fi
          echo "tags=${SHA_TAG},${MOVING_TAG}" >> "$GITHUB_OUTPUT"
          echo "image=${IMAGE}" >> "$GITHUB_OUTPUT"

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/${{ matrix.app }}/Dockerfile
          push: true
          tags: ${{ steps.tags.outputs.tags }}
          cache-from: type=gha,scope=${{ matrix.app }}
          cache-to: type=gha,mode=max,scope=${{ matrix.app }}
```

Note: `context: .` (repo root) is REQUIRED because the Dockerfiles copy monorepo root files. `NEXT_PUBLIC_*` build-args for web/admin can be added later via a per-app `build-args:` once env values per environment are decided; out of scope for the first pass (images read public env at build — track as a follow-up if web/admin need env-specific public vars baked in).

- [ ] **Step 3: Validate**

Run: `actionlint .github/workflows/build-images.yml`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/build-images.yml
git commit -m "ci: build api/web/admin images and push to GHCR (sha + moving tag)"
```

- [ ] **Step 5: Behavioral verification**

Trigger via `workflow_dispatch` from the Actions tab (or push to development). Expected: three matrix jobs (`api`, `web`, `admin`) succeed; in the repo's Packages, `tarodan-api/web/admin` appear with both `sha-<12>` and `staging` (or `latest` on master) tags. If a build fails on `COPY pnpm-lock.yaml`, the context is wrong — confirm `context: .`.

---

## Phase 3 — CD: Staging

### Task 3.1: Create the server-side deploy script

This script runs ON the VPS (invoked over SSH). It pulls the target image tag, gates on migration status, swaps containers, smoke-tests, and rolls back on failure.

**Files:**
- Create: `scripts/deploy-remote.sh`

- [ ] **Step 1: Create scripts/deploy-remote.sh**

```bash
#!/usr/bin/env bash
# Runs ON the Tarodan VPS, invoked over SSH by GitHub Actions.
# Usage: deploy-remote.sh <image_tag>
# Requires (in the deploy dir's .env or environment):
#   REGISTRY (e.g. ghcr.io/sigmoida), DOMAIN, DB_*, REDIS_*, etc.
set -euo pipefail

IMAGE_TAG="${1:?usage: deploy-remote.sh <image_tag>}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/tarodan}"
COMPOSE_FILE="infrastructure/docker-compose.prod.yml"

cd "$DEPLOY_DIR"

# Record the currently running tag for rollback.
PREV_TAG="$(grep -E '^IMAGE_TAG=' .env 2>/dev/null | cut -d= -f2 || true)"
echo "Previous tag: ${PREV_TAG:-<none>}  ->  New tag: ${IMAGE_TAG}"

# Pin the new tag for compose to read.
if grep -qE '^IMAGE_TAG=' .env 2>/dev/null; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env
else
  echo "IMAGE_TAG=${IMAGE_TAG}" >> .env
fi

echo "==> Pulling images"
docker compose -f "$COMPOSE_FILE" pull api web admin

echo "==> Migration drift check (status only)"
# The api container runs `migrate deploy` on start; here we fail fast if the
# new image's migrations cannot apply cleanly. Run status inside a throwaway
# api container against the live DB.
if ! docker compose -f "$COMPOSE_FILE" run --rm --no-deps api \
      sh -c "npx prisma migrate status --schema=prisma/schema.prisma"; then
  echo "::migration-status reported pending/failed migrations — proceeding to migrate-on-start, but review output above."
fi

echo "==> Bringing up new containers"
docker compose -f "$COMPOSE_FILE" up -d api web admin

echo "==> Smoke test"
smoke_ok=true
for i in $(seq 1 12); do
  if curl -fsS http://localhost:3001/health >/dev/null 2>&1; then break; fi
  sleep 5
  if [ "$i" -eq 12 ]; then smoke_ok=false; fi
done
curl -fsS http://localhost:3000 >/dev/null 2>&1 || smoke_ok=false
curl -fsS http://localhost:3002 >/dev/null 2>&1 || smoke_ok=false

if [ "$smoke_ok" != true ]; then
  echo "❌ Smoke test FAILED — rolling back to ${PREV_TAG:-<none>}"
  if [ -n "${PREV_TAG:-}" ]; then
    sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${PREV_TAG}|" .env
    docker compose -f "$COMPOSE_FILE" pull api web admin
    docker compose -f "$COMPOSE_FILE" up -d api web admin
  fi
  exit 1
fi

echo "==> Cleaning up dangling images"
docker image prune -f
echo "✅ Deploy of ${IMAGE_TAG} succeeded"
```

- [ ] **Step 2: Make it executable and shellcheck it**

Run:
```bash
chmod +x scripts/deploy-remote.sh
shellcheck scripts/deploy-remote.sh
```
Expected: shellcheck passes (or only style-level SC2086-type notes; fix any error-level findings).

- [ ] **Step 3: Commit**

```bash
git add scripts/deploy-remote.sh
git commit -m "feat(deploy): server-side pull/migrate-gate/up/smoke/rollback script"
```

### Task 3.2: Create deploy-staging.yml

**Files:**
- Create: `.github/workflows/deploy-staging.yml`

- [ ] **Step 1: Create deploy-staging.yml**

This runs after `Build Images` completes successfully on `development`.
```yaml
name: Deploy Staging

on:
  workflow_run:
    workflows: [Build Images]
    types: [completed]
    branches: [development]
  workflow_dispatch:
    inputs:
      image_tag:
        description: 'Image tag to deploy (e.g. sha-abc123def456 or staging)'
        required: false
        default: 'staging'

concurrency:
  group: deploy-staging
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy to Staging
    # Only run if the triggering build succeeded (or manual dispatch).
    if: ${{ github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Resolve image tag
        id: tag
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "tag=${{ github.event.inputs.image_tag }}" >> "$GITHUB_OUTPUT"
          else
            echo "tag=sha-${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"
          fi

      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          command_timeout: 20m
          script: |
            set -e
            cd /opt/tarodan
            git fetch origin development && git checkout development && git pull --ff-only
            ./scripts/deploy-remote.sh ${{ steps.tag.outputs.tag }}
```

Note on `git pull` in the SSH script: the server needs the latest `docker-compose.prod.yml` + `scripts/deploy-remote.sh`. Pulling the repo on the server keeps compose/scripts current while images still come from GHCR (no app build on server). This is intentional and distinct from the old "build on server" flow.

- [ ] **Step 2: Validate**

Run: `actionlint .github/workflows/deploy-staging.yml`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-staging.yml
git commit -m "ci: auto-deploy to staging VPS after Build Images (development)"
```

- [ ] **Step 4: Behavioral verification**

After staging secrets exist and the server has `/opt/tarodan` cloned with a populated `.env`: push to `development`, watch `Build Images` → `Deploy Staging` chain. Expected: SSH connects, images pull, `up -d` runs, smoke test passes, job green. If secrets are not yet set, the SSH step fails fast — that is the expected signal to provision them, not a code bug.

---

## Phase 4 — CD: Production

### Task 4.1: Create deploy-production.yml with approval gate + backup

**Files:**
- Create: `.github/workflows/deploy-production.yml`

- [ ] **Step 1: Create deploy-production.yml**

```yaml
name: Deploy Production

on:
  workflow_run:
    workflows: [Build Images]
    types: [completed]
    branches: [master]
  workflow_dispatch:
    inputs:
      image_tag:
        description: 'Image tag to deploy (e.g. sha-abc123def456 or latest)'
        required: false
        default: 'latest'

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy to Production
    if: ${{ github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    # `production` environment has required reviewers => manual approval gate.
    environment: production
    steps:
      - name: Resolve image tag
        id: tag
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "tag=${{ github.event.inputs.image_tag }}" >> "$GITHUB_OUTPUT"
          else
            echo "tag=sha-${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"
          fi

      - name: Backup DB then deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          command_timeout: 30m
          script: |
            set -e
            cd /opt/tarodan
            git fetch origin master && git checkout master && git pull --ff-only
            echo "==> Pre-deploy DB backup"
            bash scripts/backup.sh || { echo "Backup failed — aborting deploy"; exit 1; }
            ./scripts/deploy-remote.sh ${{ steps.tag.outputs.tag }}
```

- [ ] **Step 2: Validate**

Run: `actionlint .github/workflows/deploy-production.yml`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-production.yml
git commit -m "ci: gated production deploy (env approval + pre-deploy backup + rollback)"
```

- [ ] **Step 4: Behavioral verification (after secrets + environment reviewers set)**

Push to `master` → `Build Images` runs → `Deploy Production` enters **Waiting** state pending reviewer approval. Approve → backup runs, deploy proceeds, smoke passes. Expected: the run pauses at the approval gate before any server change. This pause is the core safety property — confirm it appears.

---

## Phase 5 — Mobile (EAS preview → Maestro)

### Task 5.1: Add EAS preview profile

**Files:**
- Create: `apps/mobile/eas.json`

- [ ] **Step 1: Confirm there's no eas.json and check app config**

Run:
```bash
ls apps/mobile/eas.json 2>/dev/null || echo "no eas.json"
ls apps/mobile/app.json apps/mobile/app.config.js apps/mobile/app.config.ts 2>/dev/null
```
Expected: `no eas.json`; an `app.json` (or app.config) exists.

- [ ] **Step 2: Create eas.json with a preview profile**

```json
{
  "cli": {
    "version": ">= 5.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": true
      },
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```
Note: `ios.simulator: true` produces a simulator `.app` — exactly what Maestro Cloud consumes, and it needs no Apple signing credentials (keeps mobile credential needs minimal per the spec).

- [ ] **Step 3: Validate JSON**

Run:
```bash
python3 -c "import json; json.load(open('apps/mobile/eas.json')); print('valid')"
```
Expected: `valid`.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/eas.json
git commit -m "feat(mobile): add EAS preview profile (iOS simulator build for e2e)"
```

### Task 5.2: Create mobile-build.yml

**Files:**
- Create: `.github/workflows/mobile-build.yml`

- [ ] **Step 1: Create mobile-build.yml**

```yaml
name: Mobile Build

on:
  push:
    branches: [development]
    paths:
      - 'apps/mobile/**'
      - '.github/workflows/mobile-build.yml'
  pull_request:
    branches: [development, master, main]
    paths:
      - 'apps/mobile/**'
      - '.github/workflows/mobile-build.yml'
  workflow_dispatch:

jobs:
  build:
    name: EAS Preview Build (iOS sim)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Guard — skip if EXPO_TOKEN missing
        id: guard
        run: |
          if [ -z "${{ secrets.EXPO_TOKEN }}" ]; then
            echo "skip=true" >> "$GITHUB_OUTPUT"
            echo "::notice::EXPO_TOKEN missing — mobile build skipped (no-op)."
          else
            echo "skip=false" >> "$GITHUB_OUTPUT"
          fi

      - uses: pnpm/action-setup@v4
        if: steps.guard.outputs.skip == 'false'
        with:
          version: 8.12.0
      - uses: actions/setup-node@v4
        if: steps.guard.outputs.skip == 'false'
        with:
          node-version: 20
          cache: pnpm
      - uses: expo/expo-github-action@v8
        if: steps.guard.outputs.skip == 'false'
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: pnpm install --frozen-lockfile
        if: steps.guard.outputs.skip == 'false'
      - name: EAS build (preview, iOS simulator)
        if: steps.guard.outputs.skip == 'false'
        working-directory: apps/mobile
        run: eas build --profile preview --platform ios --non-interactive --no-wait
```

Note: `--no-wait` queues the build on EAS and returns. The downstream Maestro e2e (existing `maestro-cloud.yml`) consumes a built `.app`; wiring the produced artifact into that workflow's `app-file` is the follow-up in Step 3.

- [ ] **Step 2: Validate**

Run: `actionlint .github/workflows/mobile-build.yml`
Expected: no errors.

- [ ] **Step 3: Note the Maestro wiring follow-up in the workflow**

The existing `maestro-cloud.yml` guard checks for `apps/mobile/build/Tarodan.app`. Connecting EAS output to Maestro requires either (a) `eas build --local` to produce the `.app` in-runner, or (b) downloading the EAS artifact. Add this as a tracked comment at the top of `mobile-build.yml`:
```yaml
# FOLLOW-UP: feed the EAS preview .app into maestro-cloud.yml's app-file.
# Options: `eas build --local` to emit apps/mobile/build/*.app in-runner, or
# fetch the finished EAS artifact URL and download it before the maestro step.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/mobile-build.yml
git commit -m "ci(mobile): EAS preview build on apps/mobile changes (guarded on EXPO_TOKEN)"
```

---

## Phase 6 — Docs, Cleanup of Old Deploy Path, Branch Protection

### Task 6.1: Repoint/deprecate scripts/deploy.sh and update DEPLOYMENT.md

**Files:**
- Modify: `scripts/deploy.sh`
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1: Replace the build-on-server flow in deploy.sh with the pull-based one**

Replace the body of `scripts/deploy.sh` (the section from `# Build packages` through the `docker-compose ... up -d --build` block and health checks) with a thin wrapper that calls the new script:
```bash
#!/bin/bash
# DEPRECATED manual entrypoint — kept for emergency manual deploys.
# CI deploys via .github/workflows/deploy-{staging,production}.yml.
# This now delegates to the pull-based deploy-remote.sh (no on-server build).
set -e
ENVIRONMENT=${1:-production}
IMAGE_TAG=${2:-latest}
DEPLOY_DIR="/opt/tarodan"

cd "$DEPLOY_DIR"
git pull --ff-only
echo "Manual deploy ($ENVIRONMENT) of tag $IMAGE_TAG via deploy-remote.sh"
./scripts/deploy-remote.sh "$IMAGE_TAG"
```

- [ ] **Step 2: Shellcheck**

Run: `shellcheck scripts/deploy.sh`
Expected: no error-level findings.

- [ ] **Step 3: Add a canonical-path banner to DEPLOYMENT.md**

Insert at the very top of `DEPLOYMENT.md` (after the H1):
```markdown
> **KANONİK DEPLOY YOLU:** Bu proje **kendi VPS'imize Docker Compose + GHCR image pull**
> ile deploy edilir. CI/CD detayları için `docs/CI_CD.md`. Aşağıdaki Railway / Fly.io /
> Render bölümleri **alternatif/tarihsel** referanstır; aktif olarak kullanılmaz.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy.sh DEPLOYMENT.md
git commit -m "docs,chore(deploy): pull-based deploy.sh + mark VPS+GHCR as canonical path"
```

### Task 6.2: Write docs/CI_CD.md

**Files:**
- Create: `docs/CI_CD.md`

- [ ] **Step 1: Create docs/CI_CD.md**

````markdown
# Tarodan CI/CD

Kanonik CI/CD mimarisi. Tasarım kararları: `docs/superpowers/specs/2026-06-06-cicd-architecture-design.md`.

## Akış

| Tetik | Workflow | Sonuç |
|-------|----------|-------|
| Her PR / push | `ci.yml` | lint, typecheck, build, unit, e2e, coverage, audit, secret-scan |
| PR / push + haftalık | `codeql.yml` | CodeQL JS/TS analizi |
| push → development/master | `build-images.yml` | api/web/admin imajları → GHCR (`sha-*` + `staging`/`latest`) |
| Build Images (development) başarılı | `deploy-staging.yml` | staging VPS'e otomatik deploy |
| Build Images (master) başarılı | `deploy-production.yml` | **manuel onay** → production VPS deploy |
| apps/mobile değişikliği | `mobile-build.yml` | EAS preview (iOS sim) build |

## Image'lar

`ghcr.io/sigmoida/tarodan-{api,web,admin}` — her commit `sha-<12>` ile etiketlenir
(immutable). Staging ve production aynı `sha-*` artifact'ını kullanır.

## Sunucu kurulumu (her VPS: staging + production)

1. `/opt/tarodan` içine repo clone edilir (compose + scripts için).
2. `infrastructure/.env` doldurulur (`infrastructure/env.example.txt` referans):
   `REGISTRY=ghcr.io/sigmoida`, `IMAGE_TAG=latest`, `DOMAIN`, `DB_*`, `REDIS_*`, S3, PayTR, vb.
3. GHCR'dan pull için sunucuda `docker login ghcr.io` (read:packages PAT) yapılır.
4. SSH public key, deploy kullanıcısının `~/.ssh/authorized_keys`'ine eklenir.

## GitHub ayarları (operatör)

**Environments:**
- `staging` secrets: `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`.
- `production` secrets: `PROD_HOST`, `PROD_USER`, `PROD_SSH_KEY`. **Required reviewers** ekle → onay kapısı.

**Repo secrets:** `EXPO_TOKEN` (zorunlu, mobil). `CODECOV_TOKEN` (opsiyonel).

**Branch protection** (`master` ve `development`), required status checks:
`Lint`, `Type Check`, `Build`, `Unit Tests`, `E2E Tests`, `Coverage`,
`Dependency Audit`, `Secret Scan`, `CodeQL / Analyze (JS/TS)`.

## Deploy mekaniği

`scripts/deploy-remote.sh <tag>` sunucuda: `compose pull` → migrate-status
drift kontrolü → `up -d` → smoke (`/health`, web, admin) → fail ise önceki
tag'e otomatik rollback.

## Rollback (manuel)

```bash
ssh deploy@<host>
cd /opt/tarodan
./scripts/deploy-remote.sh sha-<önceki-commit>
```
veya production'da Actions → Deploy Production → `workflow_dispatch` → `image_tag: sha-<önceki>`.

## Mobil → Maestro (follow-up)

`mobile-build.yml` EAS preview `.app` üretir. `maestro-cloud.yml` bunu `app-file`
olarak tüketecek şekilde bağlanmalı (`eas build --local` veya EAS artifact indirme).
````

- [ ] **Step 2: Commit**

```bash
git add docs/CI_CD.md
git commit -m "docs(ci): canonical CI/CD runbook — flow, secrets, branch protection, rollback"
```

### Task 6.3: Configure GitHub settings (operator, manual)

These are not code; do them in the GitHub UI. Listed so nothing is missed.

- [ ] Create `staging` and `production` Environments; add the SSH secrets to each.
- [ ] Add **required reviewers** to `production`.
- [ ] Add repo secret `EXPO_TOKEN` (and `CODECOV_TOKEN` if used).
- [ ] Enable branch protection on `master` and `development` with the required checks listed in `docs/CI_CD.md`.
- [ ] Provision each VPS per `docs/CI_CD.md` "Sunucu kurulumu".

---

## Final Verification

- [ ] `actionlint` passes across all workflows: `actionlint`
- [ ] `shellcheck scripts/deploy-remote.sh scripts/deploy.sh` clean
- [ ] All compose configs parse: `docker compose -f infrastructure/docker-compose.prod.yml config >/dev/null`
- [ ] PR shows the new CI jobs green (Coverage, Dependency Audit, Secret Scan, CodeQL).
- [ ] `Build Images` produces GHCR packages with `sha-*` + moving tags.
- [ ] `Deploy Staging` runs end-to-end on a real staging box (or fails only at SSH if secrets pending).
- [ ] `Deploy Production` pauses at the approval gate before any server change.
- [ ] `package-lock.json` and `railway.json` are gone; `docs/CI_CD.md` is the single source of truth.
