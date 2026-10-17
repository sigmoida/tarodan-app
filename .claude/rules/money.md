---
paths:
  - "apps/api/src/modules/payment/**"
  - "apps/api/src/modules/payment-providers/**"
  - "apps/api/src/modules/order/**"
  - "apps/api/src/modules/refund/**"
  - "apps/api/src/modules/ledger/**"
  - "apps/api/src/modules/payout/**"
  - "apps/api/src/modules/commission/**"
  - "apps/api/src/modules/discount/**"
  - "apps/api/src/modules/finance-reconciliation/**"
  - "apps/api/src/modules/admin/finance/**"
  - "packages/types/src/paytr-merchant-oid.ts"
---

# Money rules (digest)

These files move money. The full domain spec is `docs/PAYMENTS.md`; the API
rules are in `apps/api/CLAUDE.md`. A money change follows the "Money / payment"
section of tarodan-ops: `docs/definition-of-done.md`: senior developer (Opus),
behaviour-pinning test before and after, senior QA review, Sentry traceability
without PII, and an entry in tarodan-ops: `qa/critical-paths.md`.

## Amounts

- Money is `Decimal` in the schema and `Prisma.Decimal` in computation;
  `.toNumber()` only at the response boundary. Helpers that work in JS numbers
  round to the kuruş with the local `round2` pattern; never mix unrounded floats.
- PayTR amounts go through `paytr-money.util.ts`. Refund `return_amount` is TL,
  never kuruş.

## One formula, one place

- Pricing, commission, shipping, coupon and tax math live in
  `order/pricing/order-pricing.service.ts` and `order/helpers/`.
  `order-charged-base.helper.ts` (`chargedProductBaseOf`) defines the base
  everything derives from; `buyerTotalOf` and `sellerNetAmountOf` derive the
  totals; `ledger-net.ts` is the one platform-revenue formula.
- **Preview and checkout call the same function.** A display copy of a formula
  is a future incident.
- Hold-release eligibility is one predicate:
  `payout/helpers/hold-release-eligibility.ts`. Fee discounts are one engine:
  `discount/engine/fee-discount.engine.ts` (one discount per item, never
  negative, budget-capped, fixed clipping order).
- Commission rules need an active catch-all per axis; checkout fails closed
  (503) without one. Trade fees are admin-entered amounts including VAT.

## Snapshot at charge

- Charged orders freeze their outcome in money columns plus
  `Order.financialSnapshot` (pricing hash, tariff version, commission rule,
  taxes, totals). Render history from the snapshot, never by re-running
  today's rules.
- Checkout requires `idempotencyKey`, `expectedPricingHash` and
  `expectedShippingTariffVersion`; a mismatch is a 409, not a silent reprice.

## Idempotency at the database

- Ledger writes carry a deterministic `idempotencyKey` per business event
  (`capture:order:<id>`), unique with `lineNo`. Retries and replays are free.
- One-shot events use claim stamps (`reservationReleasedAt`,
  `feeDiscountBudgetReleasedAt`, `revenueInvoicedAt`, `lastChargeStartedAt`)
  checked and set atomically (CAS `updateMany`), never read-then-write.
- Refunds write their `RefundAttempt` intent **before** calling PayTR; an
  uncertain PSP result goes to `manual_review`, never a blind retry.
- Outbox handlers are at-least-once: guard each with its natural key or a stamp.

## Ledger

- Double-entry and **append-only**: a DB trigger rejects UPDATE and DELETE.
  Corrections are new reversing entries. `record(tx, ...)` runs inside the
  caller's transaction and throws on an unbalanced group.
- The ledger is the audit source; `Payment` and `PaymentHold` stay the balance
  source. Never change a reconciliation detector to hide a drift; fix the writer.

## Concurrency

- Multi-row money events run in one `$transaction`; no HTTP, mail or queue
  publish inside it.
- Lock order: payment row before order rows (cart: id order); trade row before
  its payment and legs. Use `payment/helpers/payment-order-lock.ts`. Copy an
  existing pattern (`version` CAS, `FOR UPDATE`) instead of inventing one.
- A cancelled order is never revived by a late callback; it is auto-refunded.

## PayTR

- Two stores: `marketplace` (orders, carts, trade cash, boosts, transfers) and
  `membership` (membership and recurring). Later calls use the record's
  `paytrMerchant`, never the oid prefix (`PaymentProviderRegistry.resolve`).
- Card data never reaches the API (`assertNoRawCardData`); signing only in
  `PaytrMerchantCredentials`. `merchant_oid` is built and parsed only in
  `packages/types/src/paytr-merchant-oid.ts`.
- `PAYMENT_BYPASS` is boot-guarded in production; test mode defaults to TEST
  when unset; the test lane (`isTest`) never reaches PayTR refunds or payouts.

## Tests are mandatory

- A money change lands with a spec that pins the amounts, rounding and state
  transitions (see the existing `*-money-*`, `*-contract.spec.ts`, payout and
  refund specs). A bug fix starts with a red test named after the failure.
- Run the specs of the touched module: `cd apps/api && npx jest <paths> --maxWorkers=2`.
