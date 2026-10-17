# Shipping module (and surat-cargo)

`shipping/` is the domain and HTTP layer: package tiers, tariffs, shipments, the
state machine, the warehouse address and the webhook. `surat-cargo/` is the
carrier adapter plus all carrier sync (create, tracking polls, barcode retry,
alerts). `ShippingModule` imports `SuratCargoModule`, never the reverse. API
rules: [apps/api/CLAUDE.md](../../../CLAUDE.md). Domain spec: `docs/SHIPPING.md`
(code wins when they disagree; then fix the doc).

## Ports and single sources

- Consumers inject the `CARGO_PROVIDER` token (`surat-cargo/helpers/cargo-provider.ts`),
  never `SuratCargoService`. Surat field names stay inside `surat-cargo/clients/`
  and `mappers/`.
- `tariff/shipping-tariff.service.ts` owns tariff persistence (draft, active,
  archived; one active tariff; only drafts are editable). It reads the DB on every
  pricing call on purpose. No active tariff = 503, never embedded prices.
- `helpers/shipping-tariff.helper.ts` is the pricing math:
  `resolvePackageShippingDecision` serves every checkout path and the preview;
  `splitShippingByBuyerShare` rounds the buyer side and derives the seller side
  so the two always sum to the full cost. Shipping feeds order pricing; that
  path is money (`.claude/rules/money.md`).
- `helpers/shipment-state-machine.ts` (`canTransitionShipmentStatus`) is the only
  transition gate for the manual route, webhook, polls and workers. Escrow hangs
  off `delivered`, so a regression here is money-critical.
- `warehouse/warehouse-address.service.ts` is the **only** warehouse resolver
  (setting row first, `config/warehouse.ts` fallback). Do not add a second reader.

## Identities

`Order.orderNumber` (ORD-), `OrderPackage.packageNumber` (PKG-, the parcel and
the Surat reference; stored, never derived) and `Shipment.providerTrackingId`
(Surat's tracking number). The reference sent to Surat is
`OrderPackage.carrierReference ?? packageNumber`. A seller's manual tracking
number goes to `providerTrackingId`; `trackingNumber` is only filled when empty.

## Rules

- All delivery paths funnel into `PaymentRefundService.handleOrderDelivered`.
  Each shipment sharing a package runs its own state-machine check and CAS,
  with a `ShipmentEvent`, inside the transaction.
- The manual "picked up" route checks both the shipment transition and
  `SHIPPABLE_ORDER_STATUSES`; the real lock is the conditional `updateMany` in
  the transaction (a cancelled order once resurrected to `shipped` and paid out).
- **Webhook is off by default** (`SHIPPING_WEBHOOK_ENABLED`): Surat has no signed
  callback and a guessable tracking number could start the escrow clock. When
  on, it needs `<PROVIDER>_WEBHOOK_SECRET` (timing-safe compare), logs only
  whitelisted fields, and ignores unknown statuses (never maps them to
  `in_transit`).
- Creating a shipment is idempotent and non-blocking: a failed barcode leaves
  the shipment `pending` and the barcode-retry cron finishes it. Unresolvable
  city or phone fails closed. There is no remote cancel; ops cancels in the
  Surat panel.
- Shipping is never pro-rated on refunds; the cancel/return cost split by fault
  is in `docs/SHIPPING.md` and the refund policy.
- Trades go through the warehouse in legs (`to_warehouse`, `from_warehouse`,
  `return`); Surat calls happen after the rows commit.

## Jobs

Crons are in `src/workers/cron-catalog.ts`: `sync-surat-tracking` (every 30
min: barcode retry, order, trade and return tracking), `sync-surat-post-delivery`
(hourly, 48 h) and its daily tail. They run only in the worker role, are
idempotent, and record failed steps for the alarm. `sync/cargo-alerting.service.ts`
flags ghost pickups and stale parcels with thresholds from "Süreler ve Kurallar"
(env `CARGO_*` values are fallbacks).

## Test lane

Requests carry the source's `isTest` stamp (`testLane: order.isTest`). The test
lane never calls the carrier: it returns a `TEST\d{10}` code, and the sync jobs
skip `isTest` rows. Any new carrier call must pass the stamp
(`surat-cargo-test-lane.spec.ts`).

## Configuration

`SURAT_CARGO_ENABLED`, `SURAT_SOAP_MODE` (`rest` or `stub`; boot refuses a stub
carrier on a live deployment with the carrier enabled), `SURAT_KARGO_TEST_MODE`
(test vs live host), `SURAT_CREATE_API_VERSION` (`v1`/`v2`), credentials and
timeouts (`apps/api/.env.example`). `CARGO_PROVIDER` is a DI token, not an env var.

## Tests

`shipping-webhook-unknown-status`, `shipping-webhook-parcel`,
`shipping-cancelled-order-guard`, `shipping-create-shipment`,
`surat-cargo-test-lane`, `trade-tracking-sync`, plus the tariff helper specs.
