# Legal consent records: model and API contract

The proof of every legal consent a user gives: **who accepted (or withdrew)
which document, in which version, when and from where** (IP and user agent).
One table: `consent_records` (append-only; a database trigger rejects UPDATE
and DELETE). Module: `apps/api/src/modules/consent`. Admin: **Users -> Consent
records** and the **Consents** section of the user file.

## Documents and versions: one source

`packages/types/src/legal-consent.ts` -> `CONSENT_DOCUMENTS`:

| Key                      | Version (current)  | Required for the account | Where it is taken                                 |
| ------------------------ | ------------------ | ------------------------ | ------------------------------------------------- |
| `terms`                  | `2026-08-05`       | yes                      | registration form / re-consent prompt             |
| `privacy`                | `2026-08-04`       | yes                      | registration form / re-consent prompt             |
| `kvkk`                   | `2026-08-04`       | yes (separate box)       | registration form / re-consent prompt             |
| `distance_sales`         | `2026-08-03`       | no (per order)           | cart checkout + payment form (`direct-form`)      |
| `cookies`                | `2026-08-02`       | no                       | cookie banner / cookie preferences panel          |
| `marketing`              | `2026-10-05`       | no                       | registration, notification settings, unsubscribe  |
| `platform_service_sales` | `2026-10-21-draft` | no (per order)           | boost purchase dialog (`POST .../boost/initiate`) |
| `withdrawal_waiver`      | `2026-10-21-draft` | no (per order)           | boost purchase dialog (`POST .../boost/initiate`) |

A version is the day the text changed (`YYYY-MM-DD`). **When a text changes,
update its version here**: when a required document's version changes, every
member is asked to accept again at the next sign-in; when the cookie version
changes, the banner shows again. Version and time are stamped **on the
server**: the client only says "I accept".

### Draft versions

A text that legal has not signed off carries the suffix `-draft`
(`DRAFT_CONSENT_VERSION_SUFFIX`, `isDraftConsentVersion`). A consent recorded
against it keeps the suffix in its own row, so the evidence never passes a
draft off as the signed text. When the signed text arrives, replace the text
(the web page or the checkbox copy) and set its date as the version, without
the suffix; nothing else changes. A document required for every account is
never a draft (`consent-catalog.contract.spec.ts`).

**Release blocker:** `platform_service_sales` and `withdrawal_waiver` are
drafts (tarodan-ops plan `2026-10-21-listing-boost`, decisions D15 and D17).
The release that sells boost with these consents (API task LB3, web task LB6)
must not go to production before legal has signed both texts off and their
versions have lost the `-draft` suffix.

The old `DISTANCE_SALES_CONSENT_VERSION` constant joined this catalogue. The
old `checkout_groups.distance_sales_accepted_at/_version` columns are no longer
WRITTEN (history is still read); their content is copied into
`consent_records` by `backfill:prod:distance-sales-consents` (see
`OPERATIONS.md`). The same consent is never kept twice.

## Record: who, from where

- **Member**: `userId`. **Guest buyer**: `guestEmail` (the buyer of a guest
  order is a shared system account and does not identify the person).
  **Signed-out visitor** (cookies only): a persistent `visitorId` (UUID) made
  in the browser; with a session, `userId` is written too.
- **IP**: on a mobile or direct call, the connection's IP (`trust proxy`). The
  web browser reaches the API through the gateway; the gateway carries the
  browser IP in the `x-tarodan-client-ip` header and the API trusts that
  header **only on a request from the private network** (it cannot be forged
  from outside).
- **User agent**: `User-Agent` (the gateway carries it), cut at 512
  characters.

## API

### `GET /consents/me/pending` (JWT)

The re-consent gate: the required documents the member still has to accept;
**an empty list means the gate is open**.

```jsonc
{
  "pending": [
    {
      "document": "kvkk",
      "version": "2026-08-04",
      "reason": "missing", // "missing" | "outdated"
      "path": "/privacy", // the text's path on web (may be null)
    },
  ],
}
```

A document is pending when it has no record (an account opened before this
table, a Google or Apple sign-up, an old mobile registration that sent no
consent) -> `missing`; when its latest record is an old version ->
`outdated`; when its latest record is a withdrawal -> `missing`.

### `POST /consents/me/accept` (JWT, 10/min)

```json
{ "documents": ["terms", "privacy", "kvkk"] }
```

Only keys required for the account are accepted (else `400
server.consent.documentNotAcceptable`). Only **pending** documents are
written (a double submit is harmless). Response: the documents still pending,
in the same shape as `GET`.

### `POST /consents/cookies` (public, 10/min per client IP)

```json
{
  "visitorId": "6f1c2a7e-7b0f-4e0b-9a3c-2f3d1e5a9b10",
  "preferences": { "functional": false, "analytics": true, "marketing": false }
}
```

The required category is not sent (always on). If at least one optional
category is on, the record is `granted`; if all are off, `withdrawn`.
Response: `{ "success": true }`.

### `POST /auth/register`: optional fields

```jsonc
{
  // ... existing fields ...
  "acceptsMarketingEmails": true,
  "acceptedConsents": ["terms", "privacy", "kvkk"],
}
```

Each document is its own record (KVKK separate from the terms). **Not
breaking**: a client that does not send the field still registers; the
re-consent gate asks for the missing documents at the first sign-in. With
marketing consent, a dated `marketing / granted` record is written as well.

### Distance sales: checkout and payment form

- `POST /orders/checkout`, `POST /orders/checkout/guest`, `POST /orders/guest`:
  optional `distanceSalesAccepted: boolean`. With `true` the consent is
  recorded in the same transaction as the group, bound to the cart.
- `POST /payments/direct-form`: optional `distanceSalesAccepted: boolean`. The
  common last step before the PayTR charge; if the cart, order or trade cash
  payment has no consent record yet (an offer order, a trade, a client that
  sent none at checkout), it is recorded here. An existing record is not
  written twice.
- **Requirement switch**: the platform setting
  `distance_sales_consent_required`, **off by default** (Settings -> Legal; no
  deploy needed). While off, a payment without consent goes on (no row, a
  warning is logged). While on, a purchase without a consent record that does
  not send `distanceSalesAccepted: true` gets
  `400 server.consent.distanceSalesRequired`.
- Scope: purchases of goods (cart, single or offer order, guest) and trade
  cash payments (trade fee, shipping and any cash difference; decision
  2026-10-22). Membership and boost payments do not go through this gate;
  boost has its own consents (next section).
- **Trade binding**: a trade has no order or cart, and `consent_records` has
  no trade column. A trade consent is bound to the payer's own
  `TradeCashPayment` row through `details`
  (`{ tradeId, tradeNumber, tradeCashPaymentId }`, written and read only by
  `consent/helpers/distance-sales-trade.ts`); the subject is the payer
  (`userId`). The admin Consent Records screen links the row to the trade.

### Platform services (boost): pre-contract information and withdrawal waiver

A listing boost is a platform service: the platform sells it to the seller
(`BST-` order, virtual product `boost-<boostId>`). It is accepted under two
documents, both **per order** and never an account requirement:

- `platform_service_sales`: the pre-contract information form and the
  distance service contract for platform services (web page
  `/platform-service-sales`).
- `withdrawal_waiver`: the statement that the service starts at once with the
  buyer's approval, so the right of withdrawal does not apply (no page; the
  checkbox is the statement).

Flow:

- `POST /products/:id/boost/initiate` takes `preInformationAccepted` and
  `withdrawalWaiverAccepted`. Anything but a JSON `true` for both (missing,
  `false`) is `400 server.product.boostConsentRequired` before any read or
  write; a text such as `"true"` or `"false"` is a validation 400 (the field
  is read raw, `JsonBoolean`, so implicit conversion cannot turn `"false"`
  into `true`).
- The consents belong to the price they were given on: the body's
  `expectedPrice` must be the price charged now (whole kuruş), else
  `409 server.product.boostPriceChanged` and nothing is written, so no consent
  row names a price the seller did not see. The consent check comes first.
  Details: `PAYMENTS.md`, "Boost price at consent".
- With both, **one transaction** writes the boost (`pending`), its virtual
  product, its order and one `granted` row per document
  (`PlatformServiceConsentService.recordForOrder`: catalogue version, source
  `checkout`, `userId` of the seller, `orderId` of the `BST-` order, the
  request's IP and user agent). The payment intent is created only after the
  commit, so an order never exists without its consents and a failed write
  leaves nothing behind.
- `POST /payments/direct-form` checks them again for a boost order
  (`isRecordedForOrder`, any version) and answers
  `400 server.product.boostConsentRequired` before the charge claim when one
  is missing (for example a boost order made before this rule).
- **No setting** gates it: mobile never buys a boost (ADR 0003, 0015) and the
  web dialog that sends both ships in the same release. Every buyer of a
  boost, consumer or business, gives both (plan decision D17, pending legal
  confirmation).
- Membership purchases do not record these documents yet (hub backlog); they
  can reuse `PlatformServiceConsentService`.

### Marketing consent

When `marketingEmails` in `PATCH /users/me/settings` really changes, a dated
`granted` / `withdrawn` record is written and the newsletter list is aligned.
The newsletter unsubscribe link and account deletion write `withdrawn` too.

## Admin

- `GET /admin/consents`: the list (search: member name, e-mail or code, guest
  e-mail, visitor id, IP, cart or order number; filters: `document`, `action`,
  `source`, `subjectType` = `user|guest|visitor`, `userId`, date range;
  DMMF-based sorting; `{ data, meta }` envelope). The boost documents appear
  with source `checkout` and the `BST-` order.
- `GET /admin/consents/export`: the Excel export of the same filter (shared
  pipeline: 20,000-row cap, `X-Export-Truncated-At` when exceeded); every
  download writes a required audit row (`consent_records_export`; the search
  term itself is not written, only that it was applied and its length). See
  `docs/ADMIN_EXPORTS.md`.
- `GET /admin/consents/status/:userId`: the latest record per document (one
  indexed read per document) and whether re-consent is pending.
- Permission: `users` (`PERMISSION_MAP.consents`), roles super_admin, admin,
  moderator.

## Open points (waiting for the customer)

1. **KVKK text**: there is no separate KVKK page. The `/privacy` page already
   carries the title "KVKK Aydınlatma Metni"; both the `privacy` and the
   `kvkk` box link there. If the customer gives a separate text (for example
   an explicit consent text), a new page is published and
   `CONSENT_DOCUMENTS.kvkk.path` / `.version` change. If no separate text
   comes, the customer decides whether `privacy` and `kvkk` are one document.
2. **Checkbox texts** (`auth.kvkkAgreeRich`, `legal.consentGate.acceptRich`)
   need the customer's or the lawyer's approval as legal wording; they follow
   the style of the existing registration box.
3. **First version dates** were taken from the commit dates when the texts
   were last published; if the customer gives official effective dates, they
   change.
4. **Platform service texts** (`platform_service_sales`, `withdrawal_waiver`):
   drafts until legal signs them off (see "Draft versions"); the boost release
   waits for them.
