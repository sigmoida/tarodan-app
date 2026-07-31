# Production Launch Runbook

End-to-end checklist for taking Tarodan live with an **empty storefront** (no
members, no products) and a **working admin panel** with one operational
super-admin. The catalog (categories, brands, manufacturers, attributes) is
entered manually through the admin panel after the reset — it is intentionally
not seeded.

Related: [production-database-reset.md](./production-database-reset.md)
(details of the destructive reset workflow), [STAGING_AND_SEED.md](./STAGING_AND_SEED.md).

## What runs automatically

Every API container start (`apps/api/entrypoint.sh`) runs
`prisma migrate deploy` followed by `dist-seed/prisma/seed-production.js`,
which idempotently guarantees the mandatory business references:

- membership tiers (free/basic/premium/business);
- the catch-all commission rule (`appliesTo: BOTH` — required by the checkout
  fail-closed guard and `/api/health/ready`);
- TR tax region, default KDV rate and default tax rule;
- the `platform@tarodan.com` platform-seller account (random password);
- the active Sürat shipping tariff with package tiers.

The demo seed (`prisma/seed.ts`, `*@demo.com` users, `Admin123!` admins) is
never executed on production paths; `release-production-bootstrap.spec.ts`
enforces this by contract.

## Step 1 — Code readiness

1. Merge the pre-launch PR (category hierarchy UI + warehouse-address
   settings) into `development`, then `development` → `master`.
2. Let Coolify deploy api/web/admin so the production image contains all
   migrations and the current `dist-seed`.
3. Keep the storefront locked: web env `SITE_LOCKED=true` → all public routes
   render `/coming-soon`. The admin app is separate and stays reachable.

## Step 2 — Secrets & environment check

SSH uses the repository-level `SERVER_HOST` / `SERVER_USERNAME` /
`SERVER_PASSWORD` pair — the same Coolify host serves both environments, and
`COOLIFY_PROD_UUIDS` plus the in-script guards decide what gets wiped.

GitHub `production` environment (protected, required reviewer):

- `PRODUCTION_BOOTSTRAP_ADMIN_EMAIL`
- `PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD` (16–72 bytes)
- `COOLIFY_PROD_UUIDS` (`api,web,admin`)

Production containers (the reset workflow refuses otherwise):
`NODE_ENV=production`, `APP_ENV=production`, exact production
`FRONTEND_URL`/`API_URL`, `S3_ENV_PREFIX=prod`, `PAYMENT_BYPASS=false`,
`PAYTR_TEST_MODE=false`, `PAYOUTS_DISABLED=false`, `SITE_LOCKED=true`.

Web app env for the lock: `SITE_UNLOCK_SECRET` (≥32 random chars; signs
unlock cookies — rotating it force-expires every issued unlock cookie) and
optionally `SITE_UNLOCK_PIN` as an API-independent emergency fallback code.

## Step 3 — Dry run

Run the **Production Database Reset** workflow (`workflow_dispatch`) with
`confirm=RESET_PRODUCTION`, `dry_run=true`. It validates containers,
environment guards and backup access without changing anything. Fix any
refusal before continuing.

## Step 4 — The reset

Same workflow with `dry_run=false`. It performs, in order:

1. mandatory verified `pg_dump -Fc` backup (kept on the host);
2. `prisma migrate reset --force --skip-seed`;
3. `seed-production.js` (references above);
4. `bootstrap-production-admin.js` → the single super-admin from secrets;
5. Redis + production search-index cleanup, web `.next/cache` wipe;
6. restart, readiness wait, then `verify-production-empty.js` (asserts
   `/categories`, `/manufacturers`, `/products`, `/search/products`,
   `/ads/active` are all empty while the API is ready).

## Step 5 — Admin content entry (site still locked)

Log in to the admin panel with the bootstrap credentials, then:

1. **Catalog** (order matters):
   - `Catalog → Categories` — create the category tree (parent + sort order
     are selectable in the form);
   - `Catalog → Manufacturers` (with logos);
   - `Catalog → Brands`, then `Catalog → Car Models` (models require a brand);
   - `Catalog → Attributes` — groups (e.g. scale, material) and their values.
2. **Static pages** — `Marketing → Pages`: author **about, faq, privacy,
   terms**. The storefront reads these from the DB and 404s without them.
   (`/cookies` and `/refund-policy` are hardcoded pages — no action.)
3. **Settings** — `System → Settings`: review the numeric listing/trade/message
   values, and fill the **Warehouse** tab (required before any safe-trade
   warehouse operation).
4. **Email templates** — optional; code defaults are active out of the box.
5. **Staff** — optionally add more admin accounts under `System → Staff`;
   enable 2FA on the super-admin.
6. **Early-access PINs** — `System → Early Access`: create per-person invite
   codes (label + optional email/expiry/usage limit) and send invite emails.
   The DB reset wipes existing pins — recreate them after a reset.

## Step 6 — Gradual launch, then unlock

**Gradual phase:** keep `SITE_LOCKED=true` and let invited users in with
their early-access PINs (unlock cookie lasts 10 days). Revoking a pin blocks
new unlocks; browsers already unlocked keep access until their cookie
expires — rotate `SITE_UNLOCK_SECRET` to force-expire everyone at once.

**Full launch:**

1. Set web env `SITE_LOCKED=false` in Coolify and redeploy/restart the web app.
2. Smoke test: homepage renders with empty rails, category navigation works,
   registration + login work, admin `/health/ready` stays green.

## Step 7 — Post-launch

- Watch `/api/health/ready` (it also validates the catch-all commission rule).
- Optional: prune leftover demo media under the S3 `prod/` prefix (orphaned,
  harmless — kept by the reset on purpose).
- Keep the pre-reset backup until the launch is declared stable.
