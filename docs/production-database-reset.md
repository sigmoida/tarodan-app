# Production Database Reset

This is a one-time, destructive pre-launch operation. It is deliberately not
part of the `master` push/deploy workflow. Deploying code must never erase data.

## Result

The workflow creates a clean production database with:

- all migrations applied;
- no demo customers, catalog, products, collections, orders, payments or media;
- the mandatory membership, commission, tax, shipping and platform-account
  references required by `/api/health/ready` and commerce services;
- one operational super-admin from protected GitHub environment secrets.

The S3 bucket is not deleted. Old objects may remain as unreachable orphans,
which preserves a recovery path and prevents an accidental media wipe.

## One-Time Setup

Create a protected GitHub environment named `production`, add a required
reviewer, and add these environment secrets:

- `PRODUCTION_HOST`
- `PRODUCTION_USERNAME`
- `PRODUCTION_SSH_KEY`
- `PRODUCTION_BOOTSTRAP_ADMIN_EMAIL`
- `PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD` (16-72 bytes)

The existing `COOLIFY_PROD_UUIDS` secret must contain `api,web,admin` UUIDs in
that order.

Before the reset, the production containers must have:

- API: `NODE_ENV=production`, `APP_ENV=production`, `S3_ENV_PREFIX=prod`
- API: `PAYMENT_BYPASS=false`, `PAYTR_TEST_MODE=false`,
  `PAYOUTS_DISABLED=false`
- Web: `SITE_LOCKED=true` and a strong `SITE_UNLOCK_PIN`

Search indices are automatically isolated as `production-products` and
`production-collections` from `APP_ENV`. An explicit
`ELASTICSEARCH_INDEX_PREFIX` is optional; when set in production it must be
`production`.

## Runbook

1. Deploy the intended `master` commit while the storefront is locked.
2. Open Actions > **Production Database Reset** > **Run workflow**.
3. Enter `RESET_PRODUCTION`, leave `dry_run=true`, and run it.
4. Confirm that every guard passes and the PostgreSQL container is found.
5. Run it again with `dry_run=false` and approve the protected environment.
6. Record the backup path and SHA-256 printed by the workflow.
7. Log in with the bootstrap admin and verify empty catalog/admin tables.
8. Configure real categories and business settings before unlocking the site.

The destructive run refuses to continue unless it can create a non-empty
custom-format `pg_dump` and validate it with `pg_restore -l`. It then:

1. resets the schema with `prisma migrate reset --skip-seed`;
2. bootstraps only mandatory production references;
3. creates the configured super-admin;
4. clears the selected Redis database and production-only Elasticsearch
   indices;
5. clears the Next.js fetch cache and restarts API/web;
6. requires readiness and empty public-catalog smoke checks to pass.

## Rollback

Keep the storefront locked. Use the backup path printed by the workflow and
restore it from the production PostgreSQL container with `pg_restore --clean
--if-exists`. Restart API/web, then verify `/api/health/ready` and the storefront
before removing the maintenance lock.
