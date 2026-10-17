# Invoicing module (fiscal e-documents)

`invoicing/` issues Tarodan's own revenue and refund e-documents (e-Fatura /
e-Arşiv) through an integrator. It is fiscal and irreversible once sent, so it
is money work (`.claude/rules/money.md` applies; senior developer, tests
mandatory). API rules: [apps/api/CLAUDE.md](../../../CLAUDE.md).
Provider design: `docs/INVOICING_PROVIDERS.md`; Netsis plan: `docs/NETSIS.md`.

Not this module: `modules/invoice/` makes the non-fiscal PDF order summary
(`/invoices/*`, `Invoice` table); sellers' own product invoices are
`order/invoice/seller-invoice.service.ts`. `docs/GIB_REPORT.md` is an unrelated
admin export.

## Principles

- Issue only the platform's own documents (commission, service fee, shipping
  share, membership, boost, penalty, refund). The issuer is always the platform.
- Amounts come from recorded snapshots (`CommissionLedger`, `MembershipPayment`,
  `ProductBoost`, `Order.feeDiscountBreakdown`), never recomputed from rules.
- Totals are computed in one place: `invoice/fiscal-document-totals.ts`.
  Package-fee VAT bases (`invoice/package-fee-components.ts`) must stay identical
  to the checkout tax helpers (`order-service-tax.helper.ts`), or collected and
  declared VAT diverge.
- Non-blocking: issuing never fails the business event; failures stay `pending`
  or `failed` and the retry job picks them up.

## Shape

- `invoicing.service.ts`: facade only.
- `invoice-issuing.service.ts`: which event produces which document (no amounts,
  no sending).
- `invoice-document.service.ts`: builds the neutral document (parties, VAT,
  number allocation).
- `invoice-delivery.service.ts`: cut, claim, send, PDF, retries, exhausted alarms.
- `invoice-query.service.ts`: reads with ownership checks.
- `invoice-reversal.service.ts`: refunds (cancel vs return invoice, reprice of
  unsent documents).
- `provider/e-invoice-provider.ts`: the port (`E_INVOICE_PROVIDER`). eLogo
  (`provider/elogo.provider.ts`, UBL-TR in `ubl/`) is the only binding; Netsis is
  planned and unwired. Integrator vocabulary never leaks into the neutral
  `FiscalDocumentInput`.

## Idempotency and numbering

- `FiscalInvoice` is unique on `(type, sourceId)`; `invoiceNumber` and `ettn`
  are unique. A retry reuses the same number and ETTN.
- Numbering is gap-free (`FiscalDocSequence`); revenue documents of one order
  are cut **sequentially** because they share the counter row.
- `claimInvoiceForSend` is an atomic lease (CAS on status and attempt count):
  two instances must never send the same document; a second document under one
  number is an irreversible fiscal error.
- `Order.revenueInvoicedAt` is the claim stamp, set only when every revenue
  document succeeded (and the package is fully delivered).
- Two document generations (legacy combined vs per-component package fees) must
  never mix on one package.

## Retries and alarms

`retryPendingInvoices` runs in the `elogo-retry-pending` cron (worker). Transient
errors do not consume the budget (`helpers/invoice-retry-policy.ts`,
`INVOICE_MAX_SEND_ATTEMPTS = 8`); an exhausted document raises an `error` log and
`notifyAllAdminsOnce` once a day. Admin "retry" resets attempts and keeps the
number.

## Reversal

A full refund of an unadjusted e-Arşiv within 8 days cancels it; everything else
gets a RETURN invoice per refund attempt. A wrong choice distorts the tax
declaration. Unsent documents are repriced in place.

## Test lane and environments

- `cut` returns immediately for test-lane recipients: no record, no number, no
  GİB document (`invoice-test-lane.spec.ts`).
- eLogo has no test flag; only the host decides. Boot validation forbids the live
  host on staging and requires it in production (`docs/OPERATIONS.md`, "eLogo
  ortamı"). Check live config with `pnpm --filter @tarodan/api smoke:elogo -- diagnose`.

## Historical names

DB tables, routes (`/elogo/invoices*`, a mobile contract), the cron id,
`ELOGO_*` env keys, `server.elogo.*` i18n keys, S3 folders and notification types
keep their eLogo names on purpose (stored data, clients, ops).
`helpers/fiscal-invoices-migration.spec.ts` pins the `@map`s; changing them
needs a deploy note.

## Tests

`invoice-issuing-package-fees`, `invoice-issuing-penalty`, `invoice-test-lane`,
`invoice-delivery.provider-port`, `invoice/package-fee-basis`,
`invoice/penalty-basis`, `helpers/invoice-retry-budget`,
`provider/e-invoice-provider.contract`.
