# Seller trust score

The seller trust score ("Güven skoru") is a 0.00 to 5.00 rating built from what
a seller actually does on Tarodan. It is computed by one nightly batch and
stored; a profile read is a primary-key lookup. Decision record: tarodan-ops
`decisions/0014-seller-trust-score-batch-0-to-5.md`; plan:
`plans/2026-10-21-seller-trust-score.md`.

| What                                                | Where                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Formula (pure) and its pinning specs                | `apps/api/src/modules/seller-trust/helpers/trust-formula.ts`, `.spec.ts`, `.v1-pin.spec.ts`                         |
| Constants (v1)                                      | `seller-trust/helpers/trust-formula.constants.ts`                                                                   |
| Golden scenarios (approved v1 outcomes)             | `seller-trust/helpers/trust-golden-v1.ts`, `trust-formula.golden.spec.ts`                                           |
| Version, levels, thresholds, read shapes, formatter | `packages/types/src/seller-trust.ts`                                                                                |
| Formula inputs, parameters, validator, explanation  | `packages/types/src/seller-trust-lab.ts` (API and admin only), `seller-trust/helpers/trust-explain.ts`              |
| Table owner                                         | `seller-trust/seller-trust.service.ts` (`seller_trust_scores`)                                                      |
| Batch                                               | `seller-trust/jobs/seller-trust-scheduler.service.ts` (`seller-trust-refresh`)                                      |
| Input read (one path for the batch and read tools)  | `seller-trust/inputs/seller-trust-inputs.reader.ts` (`SellerTrustInputsReader`)                                     |
| Aggregates, one per owning domain                   | `order/stats/`, `refund/stats/`, `rating/stats/`, `trade/stats/`, `user/stats/` (`*-seller-trust-stats.service.ts`) |
| Admin lab (read-only)                               | `seller-trust/lab/` (`SellerTrustLabService`), `admin/users/seller-trust-lab/` (controller, audit)                  |

Any change to a definition or a constant below is a product decision and bumps
`SELLER_TRUST_FORMULA_VERSION`. v1 is live in production since the release
`app-2026.10.25-1`, so a change is now always a v2: a version bump, a staging
calibration, a user decision and an ADR (ADR 0014). The admin lab ("Lab",
below) produces the evidence for such a decision; it never changes v1.

## Data rules (apply everywhere)

- Every window ends at one instant, `asOf`, taken when the run starts. Windows
  are half open: `[asOf - N days, asOf)`.
- Test-lane rows never count (`orders.is_test`, `trades.is_test`).
- Platform service orders never count (`orders.origin = platform_service`):
  membership and boost purchases, created with the platform account as the
  seller by `membership-subscription.service.ts` and
  `product-boost.service.ts`. They are not seller sales.
- Scored accounts: everyone who is not deleted, not banned and not a test-lane
  account. The platform account is scored like everyone else, from its real
  sales only (decision D5). There is no special case per account type.

## Components (v1)

| #   | Component   | Weight | Definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Window                         |
| --- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1   | Rating      | 0.40   | Published (`approved`) ratings received **as seller** (the rated order's `seller_id` is the receiver) or on a completed trade. Banned givers are left out. Each giver's scores are averaged first (one vote per person), then smoothed: `R = (5 × 4.0 + Σ giver_mean) / (5 + n_givers)`. `s1 = (R − 1) / 4`                                                                                                                                                                                            | `ratings.created_at`, 730 days |
| 2   | Reliability | 0.25   | `E` = paid orders (`preparing_deadline` set) whose **first** deadline `coalesce(original_preparing_deadline, preparing_deadline)` is in the window and has passed, minus cancellations that are not failures (see below). `F` = failures among them. `f = (F + 10 × 0.02) / (E + 10)`, `s2 = clamp(1 − f / 0.25, 0, 1)`                                                                                                                                                                                | first deadline, 365 days       |
| 3   | On-time     | 0.15   | `S` = orders in `E` with `shipments.shipped_at` (the first physical carrier handoff, stamped by the Surat tracking sync or by an admin's manual tracking entry). `L` = those with `shipped_at > first deadline + 2 h`; the grace absorbs the 30-minute sync lag. An extension does not help (decision D4). `l = (L + 10 × 0.05) / (S + 10)`, `s3 = clamp(1 − l / 0.5, 0, 1)`                                                                                                                           | as 2                           |
| 4   | Volume      | 0.15   | `N` = completed sales (`status = completed`, `completed_at` in the window) plus completed trades (`completed_at` in the window), at most 3 per counterparty across sales and trades together. Guest checkouts share one system buyer (`guest@tarodan.system`), so a guest is told apart by the e-mail stored on the order (`shipping_address.guestEmail`, trimmed, lower-cased and hashed in SQL; never stored); a guest order without one is its own counterparty. `s4 = min(1, ln(1 + N) / ln(101))` | 730 days                       |
| 5   | Tenure      | 0.05   | `D` = whole days since `users.created_at`. `s5 = min(1, D / 730)`                                                                                                                                                                                                                                                                                                                                                                                                                                      | none                           |

```
score      = 5 × (0.40·s1 + 0.25·s2 + 0.15·s3 + 0.15·s4 + 0.05·s5)
score_x100 = round half up (score × 100), clamped to 0..500
```

### Seller-caused failures (reliability)

The definition rests only on fields that are populated for old and new rows:

| Counts as a failure                                                                                                    | Evidence                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic cancellation because the seller did not ship in time                                                         | `cancel_reason` is the fixed text `ORDER_CANCEL_REASON.sellerShipDeadlineExpired`, written since 2026-04-22; any `cancelled_by`, including NULL                                                |
| Automatic cancellation right after payment: the stock could not cover the order (stock is the seller's responsibility) | `cancel_reason` is the fixed text `ORDER_CANCEL_REASON.oversoldAfterPayment`, written only by payment fulfilment since 2026-07-28; any `cancelled_by` (`system` since 2026-09-18, NULL before) |
| Cancellation by the seller                                                                                             | `cancelled_by = seller` (no order path writes it today; kept for when a seller cancel exists)                                                                                                  |
| Platform cancellation for a seller-fault reason                                                                        | `cancelled_by = platform` and `admin_cancel_reason_code` in `stock_error`, `listing_violation`                                                                                                 |
| A refund the seller was found at fault for                                                                             | a `refund_requests` row with `fault_party = seller` and `status = refunded` (the reviewed fact; `reason` is only the buyer's claim)                                                            |

Payment fulfilment clears `preparing_deadline` in the same write that cancels
an oversold order, so these orders have no deadline. They join `E` anchored at
the cancellation instead: `cancelled_at`, or `created_at` for rows from before
2026-09-18 (payment follows creation within the 24-hour payment window).

Every other cancellation is **left out of `E`**: it is neither a success nor
counted against the seller. That covers buyer and system cancellations,
platform cancellations for neutral reasons, and cancellations whose cause is
unknown.

Why: `orders.cancelled_at` was added on 2026-09-18 without a backfill, and the
`cancelled_by` backfill (`20260922100000_cancellation_actor`) only touched rows
with `cancelled_at` set. So every order cancelled before 2026-09-18 has
`cancelled_by = NULL` (production on 2026-10-21: 17 of 19 cancellations in the
last 365 days). Those rows are judged only by the reason text and by reviewed
refunds, never by the missing actor.

## Minimum data and levels

- A score exists only when `N ≥ 5` (after the cap) and there are at least 3
  distinct counterparties. Otherwise `score_x100` is NULL and the level is
  `new`. The row is still written with its breakdown.
- A user with no counted rating, eligible order or transaction gets no row.
- Levels (derived by `sellerTrustLevel()` in `@tarodan/types`, never stored):
  `excellent` ≥ 4.50, `trusted` ≥ 4.00, `fair` ≥ 3.00, `developing` below,
  `new` without a score.

## Storage

`seller_trust_scores`: one row per seller, primary key `user_id` (cascades with
the user), `score_x100 SMALLINT NULL CHECK 0..500`, `formula_version`,
`components JSONB` (`SellerTrustComponentsV1`: counts and sub-scores only, no
personal data), `computed_at` (the run's `asOf`). Only the primary key is
indexed and the table has `fillfactor = 90`, so the nightly upserts are HOT.
Nothing is written to `users`.

## The nightly run

Cron `seller-trust-refresh` at 02:30 Europe/Istanbul, before
`update-popularity` (03:00).

1. **Lock.** Redis `seller-trust:refresh-lock` (2 h TTL), on top of Bull's
   one-consumer delivery. A run that finds the lock held returns
   `skipped: locked` and touches nothing. If Redis cannot be reached the run
   fails instead (retry and cron alert), so a Redis outage never looks like a
   green no-op.
2. **Candidates** (one read-only snapshot): sellers with a paid order in the
   last 760 days (the volume window plus a 30-day margin, because an order
   completes days to weeks after payment) and participants of trades
   completed in the last 730 days. Sorted, deduplicated, batches of 500.
3. **Per batch:** one `READ ONLY, REPEATABLE READ` transaction with a 15 s
   `statement_timeout` (30 s overall) runs the domain aggregates; the formula
   runs in memory; one multi-row `INSERT ... ON CONFLICT (user_id) DO UPDATE`
   with a 2 s `lock_timeout` and a 10 s `statement_timeout` writes the batch,
   stamped `computed_at = asOf`. 100 ms pause between batches.
4. **Failures:** a failed batch is logged at `warn` with its index and error
   class (no ids, no messages) and the run continues. The run stops starting
   batches after 90 minutes, well inside the lock TTL.
5. **Cleanup** only when every batch succeeded:
   `DELETE ... WHERE computed_at < asOf` removes sellers that dropped out, or
   were banned, deleted or moved to the test lane. Otherwise every old row is
   kept and the job fails (Bull retries 3 times; the failed run logs its
   alarm at `error`, which reaches Sentry). A run that wrote no row at all also skips the cleanup
   (`cleanup skipped: ...`): an empty result is far more likely a broken
   query or an empty snapshot than every seller leaving at once.
6. **Result** (admin jobs page, Bull job data): `candidates`, `batches`,
   `eligible`, `scored`, `notEnoughData`, `written`, `deleted`,
   `failedBatches`.

Re-running over unchanged data writes the same rows. Each batch reads its own
snapshot, so a change during a run (an order shipped between two batches) is
seen by the later batches only; the next night evens it out.

### Indexes used

No new index on a hot table. Each query uses an existing one:

| Query                | Index                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| candidate sellers    | `orders(preparing_deadline)`                                             |
| candidate traders    | `trades(completed_at)`                                                   |
| eligibility, tenure  | `users` primary key                                                      |
| fulfilment, sales    | `orders(seller_id)`, `shipments(order_id)` unique                        |
| seller-fault refunds | `orders(seller_id)`, `refund_requests(order_id)`                         |
| ratings              | `ratings(receiver_id)`, then primary keys of `orders`, `trades`, `users` |
| trade volume         | `trades(initiator_id)`, `trades(receiver_id)`                            |
| guest buyer          | `users(email)` unique                                                    |

At production size on 2026-10-21 (12 sellers to score, the largest with 67
orders) a run reads a few hundred rows. Revisit the indexes if a seller grows
past tens of thousands of orders (`orders (seller_id, preparing_deadline)`).

## Read path

Nothing is computed per request. Every read goes through
`SellerTrustService` (`getForUser`: one primary-key lookup; `getForUsers`: one
query for a list; `getAdminView`: with the breakdown). A missing row is the
`new` level with the current formula version.

| Surface                  | Field                                                              | Rule                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /users/:id/profile` | `trust: { rating, level, formulaVersion } \| null`                 | Premium sellers only (decision D6); null otherwise. The platform account is scored and shown like every seller (D5)                                                                                                                                |
| `GET /users/me`          | `trust: { rating, level, formulaVersion }`                         | Always, premium or not: the owner sees their own score                                                                                                                                                                                             |
| both                     | `trustScore`, `trustLevel` (deprecated)                            | For live mobile 1.0.5 (D7): `round(rating × 20)` and the old Turkish label (`Çok Güvenilir`, `Güvenilir`, `Orta`, `Gelişmekte`); both null when `trust` is null or has no score (`Yeni` is no longer sent). `seller-trust/helpers/legacy-trust.ts` |
| `GET /admin/users/:id`   | `trust: { rating, level, formulaVersion, components, computedAt }` | `components` is the stored `SellerTrustComponentsV1`; `computedAt` null means not computed yet                                                                                                                                                     |
| Listing ranking          | `qualityScore` rating part                                         | `round(rating × 4)`, 0 to 20; 0 without a score. No verified-seller bonus (D8). `product/helpers/quality-score.ts`, read by `ProductRankingService` and the nightly `update-popularity` (03:00, after this run)                                    |

The profile counters (`stats.totalSales`, `totalTrades`, `averageRating`,
`totalRatings`) stay live counts and are not the score's inputs.
`users.show_trust_score` is still accepted from old clients and has no effect.

## Lab (admin, read-only)

Admin > System > "Güven skoru laboratuvarı" explains, recomputes and simulates
the score with the same formula code as the batch (tarodan-ops plan
`plans/2026-11-03-seller-trust-score-lab.md`). It works on every environment,
production included, and never writes a score, a ranking or a cache entry.
Candidates are evidence for a v2 decision; the weights are never live.

Access: super admin and admin through the permission `seller_trust_lab`
(Hesaplar > Roller, System group). The controller also requires the
`super_admin` or `admin` role, so a moderator is refused even if the matrix
lists the key. An environment that stores a role matrix from before the key
keeps the lab closed to admin until a super admin ticks it once (fail closed).

| Route (`/admin/seller-trust-lab`) | Does                                                                                                                                                                                                                                                 | Reads                                                 | Audit                         | Limit/min |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------- | --------- |
| `GET params`                      | v1 params, limits, component order, version, environment (`env`, `isProd`)                                                                                                                                                                           | none                                                  | no                            | 60        |
| `GET scenarios`                   | the ten approved golden scenarios (`helpers/trust-golden-v1.ts`) with their v1 explanation                                                                                                                                                           | none                                                  | no                            | 60        |
| `POST scenario`                   | `{ inputs, params? }`: hypothetical inputs, v1 and the candidate                                                                                                                                                                                     | none                                                  | no (no real data)             | 60        |
| `POST sellers/:userId`            | `{ asOf?: "now" \| "stored", params? }`: the stored row, the live inputs read by `SellerTrustInputsReader`, v1 and the candidate explained, the inputs that changed since the stored run; not scored (deleted, banned, test lane) instead of a score | one snapshot, about 7 indexed statements for one id   | `seller_trust_lab_seller`     | 30        |
| `POST population`                 | `{ params, filters?: { levels?, minTransactions? } }`: the candidate against every stored row: level and score distributions, level matrix, top 20 movers each way, v1 consistency, an id-free proposal                                              | `seller_trust_scores` only, plus at most 40 usernames | `seller_trust_lab_population` | 6         |

- **Read-only, proven.** Every read runs in one `inReadOnlySnapshot` (READ
  ONLY, REPEATABLE READ; 5 s statement timeout; 10 s per seller, 20 s per
  population), so Postgres refuses a write. A contract spec
  (`lab/seller-trust-lab.readonly.contract.spec.ts`) forbids write, cache,
  queue, event and outbox calls in the lab code; a Prisma-double spec fails
  any read outside the snapshot; the e2e (`test/e2e/seller-trust-lab.e2e-spec.ts`)
  calls every route and checks that the score table, the product ranking
  columns and the scheduled queue are unchanged, and that the only new rows
  are the audit rows.
- **Validation.** `params` and `inputs` are validated once by the shared
  validators (`validateSellerTrustParams`, `validateSellerTrustInputs` in
  `@tarodan/types`) on a plain copy, which is what the lab computes with: 400
  `server.sellerTrustLab.invalidParams` or `invalidInputs` naming the field.
  Windows, the late grace, the per-counterparty cap and the version are not
  parameters (decision D3) and are refused.
- **Population source.** Stored rows only (decision D2): every input is in the
  stored breakdown except the rating sum, rebuilt from the smoothed mean and
  the v1 prior. The rebuilt v1 score can miss the stored one by 0.01 at an
  exact rounding boundary; `v1Consistency` counts `matched`, `offByOne` and
  `mismatched` (drift). Rows of another version or an unreadable breakdown are
  skipped and counted. More than 20,000 matching rows is a 422
  `server.sellerTrustLab.populationTooLarge`, answered before any row is read.
- **Privacy.** Responses carry user id and username (as admin user detail
  does), counts and sub-scores; never a counterparty key, an order or trade
  id, a buyer name or an e-mail (hash). The proposal export has no user id or
  username. Every seller and population call writes a fail-closed audit row
  (actor, action, entity, numeric params or a params hash): no audit, no
  result. Responses are `Cache-Control: no-store`.
- **Logs.** One `info` line per population run (rows, consistency counts,
  duration; no ids). 5xx reach Sentry through `SentryInterceptor`.

## Operations

See `docs/OPERATIONS.md`, "Seller trust score": the bootstrap run, a manual run,
the calibration queries and the lab.
