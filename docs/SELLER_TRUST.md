# Seller trust score

The seller trust score ("Güven skoru") is a 0.00 to 5.00 rating built from what
a seller actually does on Tarodan. It is computed by one nightly batch and
stored; a profile read is a primary-key lookup. Decision record: tarodan-ops
`decisions/0014-seller-trust-score-batch-0-to-5.md`; plan:
`plans/2026-10-21-seller-trust-score.md`.

| What                                                | Where                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Formula (pure) and its pinning spec                 | `apps/api/src/modules/seller-trust/helpers/trust-formula.ts`, `.spec.ts`                                            |
| Constants (v1)                                      | `seller-trust/helpers/trust-formula.constants.ts`                                                                   |
| Version, levels, thresholds, read shapes, formatter | `packages/types/src/seller-trust.ts`                                                                                |
| Table owner                                         | `seller-trust/seller-trust.service.ts` (`seller_trust_scores`)                                                      |
| Batch                                               | `seller-trust/jobs/seller-trust-scheduler.service.ts` (`seller-trust-refresh`)                                      |
| Aggregates, one per owning domain                   | `order/stats/`, `refund/stats/`, `rating/stats/`, `trade/stats/`, `user/stats/` (`*-seller-trust-stats.service.ts`) |

Any change to a definition or a constant below is a product decision and bumps
`SELLER_TRUST_FORMULA_VERSION`.

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

| #   | Component   | Weight | Definition                                                                                                                                                                                                                                                                                                                                                                   | Window                         |
| --- | ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | Rating      | 0.40   | Published (`approved`) ratings received **as seller** (the rated order's `seller_id` is the receiver) or on a completed trade. Banned givers are left out. Each giver's scores are averaged first (one vote per person), then smoothed: `R = (5 × 4.0 + Σ giver_mean) / (5 + n_givers)`. `s1 = (R − 1) / 4`                                                                  | `ratings.created_at`, 730 days |
| 2   | Reliability | 0.25   | `E` = paid orders (`preparing_deadline` set) whose **first** deadline `coalesce(original_preparing_deadline, preparing_deadline)` is in the window and has passed, minus cancellations that are not failures (see below). `F` = failures among them. `f = (F + 10 × 0.02) / (E + 10)`, `s2 = clamp(1 − f / 0.25, 0, 1)`                                                      | first deadline, 365 days       |
| 3   | On-time     | 0.15   | `S` = orders in `E` with `shipments.shipped_at` (the first physical carrier handoff, stamped by the Surat tracking sync or by an admin's manual tracking entry). `L` = those with `shipped_at > first deadline + 2 h`; the grace absorbs the 30-minute sync lag. An extension does not help (decision D4). `l = (L + 10 × 0.05) / (S + 10)`, `s3 = clamp(1 − l / 0.5, 0, 1)` | as 2                           |
| 4   | Volume      | 0.15   | `N` = completed sales (`status = completed`, `completed_at` in the window) plus completed trades (`completed_at` in the window), at most 3 per counterparty across sales and trades together. Guest checkouts share one system buyer (`guest@tarodan.system`), so each guest order is its own counterparty. `s4 = min(1, ln(1 + N) / ln(101))`                               | 730 days                       |
| 5   | Tenure      | 0.05   | `D` = whole days since `users.created_at`. `s5 = min(1, D / 730)`                                                                                                                                                                                                                                                                                                            | none                           |

```
score      = 5 × (0.40·s1 + 0.25·s2 + 0.15·s3 + 0.15·s4 + 0.05·s5)
score_x100 = round half up (score × 100), clamped to 0..500
```

### Seller-caused failures (reliability)

The definition rests only on fields that are populated for old and new rows:

| Counts as a failure                                            | Evidence                                                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic cancellation because the seller did not ship in time | `cancel_reason` is the fixed text `ORDER_CANCEL_REASON.sellerShipDeadlineExpired`, written since 2026-04-22; any `cancelled_by`, including NULL |
| Cancellation by the seller                                     | `cancelled_by = seller` (no order path writes it today; kept for when a seller cancel exists)                                                   |
| Platform cancellation for a seller-fault reason                | `cancelled_by = platform` and `admin_cancel_reason_code` in `stock_error`, `listing_violation`                                                  |
| A refund the seller was found at fault for                     | a `refund_requests` row with `fault_party = seller` and `status = refunded` (the reviewed fact; `reason` is only the buyer's claim)             |

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
   one-consumer delivery. A run that does not get it returns
   `skipped: locked` and touches nothing.
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
   kept and the job fails (Bull retries 3 times; the Sentry cron monitor
   alerts by e-mail).
6. **Result** (admin jobs page, Bull job data): `candidates`, `batches`,
   `eligible`, `scored`, `notEnoughData`, `written`, `deleted`,
   `failedBatches`.

A run is a pure function of the data at `asOf`: re-running it writes the same
rows.

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

## Operations

See `docs/OPERATIONS.md`, "Seller trust score": the bootstrap run, a manual run
and the calibration queries.
