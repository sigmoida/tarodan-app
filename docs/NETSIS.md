# Logo Netsis (NetOpenX REST) integration

The customer is moving from eLogo to the Logo Netsis ERP. The API talks to
Netsis through **NetOpenX REST** (JSON over HTTPS, token auth) running on the
customer's Netsis server. Code: `apps/api/src/modules/netsis/`.

**Status (2026-10-12):** `InvoicingModule` imports `NetsisModule` and
registers `NetsisInvoiceProvider` (`modules/invoicing/provider/netsis.provider.ts`).
New invoices go through Netsis only with `INVOICE_PROVIDER=netsis`; the
default is still eLogo. We have **no access to a Netsis instance yet** —
every request/response shape is a documented guess, marked `VERIFY` in code
and listed at the end of this page. The invoicing flow itself is described in
`docs/INVOICING_PROVIDERS.md` → "Netsis adaptörü". Collections and payouts are
mirrored by the accounting sync (off by default), see "Muhasebe senkronu".

## What the customer must provide

- Netsis **8.06 or later** with the **NetOpenX REST** service installed and
  running, and a **NetOpenX licence** (it counts concurrent sessions — one is
  enough for us, see below).
- Network reach from our servers (Coolify host: web + worker containers) to
  the REST service: public HTTPS endpoint or site-to-site VPN, with a
  certificate our Node runtime trusts (a self-signed certificate is classified
  as a `configuration` error, not retried).
- A **test company** (database) first, then the live one: company name
  (`dbname`), a Netsis application user + password, the SQL login the REST
  service uses for that company (`dbuser`/`dbpassword`), and the branch code.
- A least-privilege SQL login: `Queries` runs raw SQL; our guard rejects
  non-SELECTs, but the real boundary is the login's permissions.

## Configuration

All keys are declared in `config/env.validation.ts` and read through
`config/netsis.ts` (`NETSIS_CONFIG` provider). See `apps/api/.env.example`.

| Key | Default | Notes |
| --- | --- | --- |
| `NETSIS_ENABLED` | `false` | Off → the facade refuses every call (localized 503). |
| `NETSIS_MODE` | `stub` | `stub` = in-memory, no network; `live` = real REST. |
| `NETSIS_BASE_URL` | — | Host without `/api/v2`, e.g. `https://netsis.example:7070`. |
| `NETSIS_USERNAME` / `NETSIS_PASSWORD` | — | Netsis application user. |
| `NETSIS_DB_NAME` | — | Company name as `public/CompanyList` lists it. |
| `NETSIS_DB_USER` / `NETSIS_DB_PASSWORD` | — | SQL login for that company. |
| `NETSIS_DB_TYPE` | `vtMSSQL` | |
| `NETSIS_BRANCH_CODE` | `0` | |
| `NETSIS_TIMEOUT_MS` | `15000` | Per request. |
| `NETSIS_TOKEN_SAFETY_SECONDS` | `60` | Token leaves Redis this early. |

Boot guards (`NODE_ENV=production` only; eLogo guards unchanged): with
`NETSIS_ENABLED=true`, `APP_ENV=production` requires `NETSIS_MODE=live`;
staging may run `stub` or `live`. Whenever `live`, the base URL must be HTTPS
and all five credentials set. Unknown modes and malformed numbers fail boot.

## Module layout

- `NetsisClientFacade` — the only export. Exposes `arps`, `items`,
  `itemSlips`, `eDocuments`, `receipts`, `transactions`, `publicApi`,
  `queries` and `ping()`, delegating to the gateway `NETSIS_MODE` selects.
- `gateway/netsis-gateway.ts` — the `NetsisGateway` interface;
  `NetsisLiveGateway` and `NetsisStubGateway` implement it, and
  `netsis-gateway.contract.spec.ts` pins that both carry every method.
- `clients/` — one typed class per resource; `http/` — transport (timeouts,
  envelope unwrapping, the one place `transId` is attached) and
  `classifyNetsisError` (`network | auth | validation | conflict |
  configuration | unknown`); `session/` — the shared session.
- `helpers/netsis.types.ts` — guessed models with a passthrough index
  signature; `helpers/netsis-model.helper.ts` — the only code that reads their
  key fields. Pinning a model is a type edit there, not a redesign.

The stub mimics the server's rules, numbers deterministically
(`TRD2026000000001`) and offers `snapshot()` / `setEDocumentState()` /
`reset()` for the future invoicing provider's specs.

## The shared session — and why

The NetOpenX licence counts **concurrent sessions**, and the API runs as
several processes (`PROCESS_ROLE=web` and `worker`, possibly more replicas).
If each process logged in, we would hold N seats and logins would start
failing when the licence is full. So all processes share **one** token:

1. The token lives in Redis under `netsis:token` with
   TTL = `expires_in − NETSIS_TOKEN_SAFETY_SECONDS` (half the lifetime if the
   margin would eat it; 600 s if `expires_in` is missing).
2. On a miss, the process that wins `CacheService.setIfAbsent("netsis:token:lock")`
   logs in; the others poll the cache until the token appears (or the lock
   expires). Inside a process, concurrent callers share one acquisition.
3. On **401** the token is dropped (only if it is still the one that failed)
   and the call is retried **once** with a fresh login; a second 401 is
   thrown. Calls inside a transaction are never retried — the transaction
   belongs to the old session.
4. Redis down → the lock cannot be taken → calls fail with
   `server.netsis.sessionBusy`. Deliberately fail-closed.
5. Shutdown does **not** revoke: the token is shared, and a restarting process
   reuses it from Redis instead of opening a new seat. `revoke()` exists for
   tests, scripts and a deliberate logout.

Credentials and tokens are never logged; exceptions carry a response-body
snippet, never the request body.

## Smoke script

```bash
cd apps/api && pnpm smoke:netsis   # read-only (the only mode); --out <dir> to redirect
```

It calls the `public/*` endpoints, takes a token, calls the authenticated
`ping`, saves `definitions/<R>` + `services/<R>` for the six modelled
resources and `services/describe` into `apps/api/scripts/netsis-definitions/`
(gitignored), then revokes the token. Secrets are redacted. Run it on the test
company first; use the dumps to pin `netsis.types.ts`.

## How the invoicing provider uses Netsis (assumptions)

Field names the provider writes live in
`modules/invoicing/provider/netsis-invoice.constants.ts`; the pure mapper is
`netsis-slip.mapper.ts`. Our field → Netsis field:

| Ours (`FiscalDocumentInput`) | Netsis | VERIFY |
| --- | --- | --- |
| `kind` SALE / RETURN | `FaturaTip` = `ftSFat` / `ftAFat` (`NETSIS_DOC_TYPES`) | yes |
| `kind` SALE / RETURN | `FatUst.TIPI` = `ftKapali` / `ftIade` | yes |
| cari (pooled retail or user `adminCode`) | `FatUst.CARI_KODU` | key name |
| Netsis serial number | `FatUst.FATIRS_NO` (absent for `Calculate`) | yes |
| `issueDate` (TR calendar) | `FatUst.TARIH` | format |
| `issueTime` | `FatUst.FATURA_SAATI` | yes |
| `note` (≤ 50) | `FatUst.ACIKLAMA` | length |
| `scenario` | `FatUst.EBELGE_TIPI` = `EFATURA` / `EARSIV` | yes |
| `sendType` (e-Arşiv only) | `FatUst.EARSIV_GONDERIM_SEKLI` | yes |
| `ettn` | `FatUst.ETTN` (Netsis may assign its own; the send result's ETTN wins) | yes |
| `ettn` (our reference) | `FatUst.EKACK1` | yes |
| `sourceReference` (KYT-…) | `FatUst.EKACK2` | yes |
| `billingReference` | `FatUst.IADE_FATIRS_NO` / `IADE_FATIRS_TARIH` | yes |
| pooled cari: customer title / first / last name, TCKN, address, city, district, e-mail | `FatUst.EBELGE_ALICI_UNVAN` / `_AD` / `_SOYAD` / `_VKNTCKN` / `_ADRES` / `_IL` / `_ILCE` / `_EPOSTA` | yes |
| item card code (per invoice type, from settings) | `Kalems[].STOK_KODU` | — |
| `quantity` | `Kalems[].STHAR_GCMIK` | — |
| line net ÷ quantity (6 dp) | `Kalems[].STHAR_NF` | precision |
| `unitPrice` (gross unit, 6 dp) | `Kalems[].STHAR_BF` | precision |
| `vatRate` | `Kalems[].STHAR_KDV` | — |
| `name` (≤ 50) | `Kalems[].STHAR_ACIKLAMA` | length |
| `discount` as % of gross line (4 dp) | `Kalems[].STHAR_SATISK` | yes |

Other assumptions:

- `providerRef` stored on our record = `<FaturaTip>:<FATIRS_NO>`; the
  e-document request is `{ FaturaTip, FATIRS_NO, ETTN? }`.
- The cari's e-invoice flag and PK label are read from `CariEkBilgi` (then
  `CariTemelBilgi`) fields `EFATURA_KULLANICISI` (`E`/`H`) and
  `EFATURA_ETIKET` (plus a few spellings) —
  `helpers/netsis-model.helper.ts` → `readNetsisArpEInvoiceProfile`. An
  unreadable flag means e-Arşiv, never e-invoice.
- Corporate cari code = the user's B/K code (`K010042`); `CARI_KOD` assumed
  ≤ 15 characters, `STOK_KODU` ≤ 35.
- `Calculate` is run on the number-less slip; a number obtained inside a
  transaction that is then rolled back is assumed to be returned to the
  serial (if not, a failed create leaves a gap — ask).
- Re-sending an existing slip runs `Calculate` on the stored slip (from
  `Details`) to detect amounts that changed since it was created.

## Muhasebe senkronu (accounting sync)

Customer decision: "tahsilat ve ödeme aktarımı isteniyor" — accounting must
see collections and payouts next to the invoices. Code:
`modules/invoicing/accounting/` (+ `jobs/netsis-accounting-*`). It mirrors
money movements that have **already happened**; it never moves money and the
money flows never wait for it or fail because of it.

### Flows (first version — every Netsis field is `VERIFY`)

| Our event (source → `NetsisSyncKind`) | Netsis record | Cari / accounts | Amount |
| --- | --- | --- | --- |
| Netsis-issued `FiscalInvoice` is `sent`/`signed` (not `return_invoice`; eLogo rows ignored) → `invoice_collection` | `MixedReceiptsMain` collection, `BELGE_NO` + `FATIRS_NO` = invoice number (closes the invoice), dated the invoice date | the invoice's own cari, read from the Netsis slip (`ItemSlips/Details` → `CARI_KODU`); paid into `netsis.account.paytrClearing` | invoice gross (`total`) |
| Realized `PaytrSettlement` (not a projection) whose items were synced → `settlement_transfer` | `BankRemittanceTransfer` from the PayTR clearing account to `netsis.account.mainBank`, `BELGE_NO` = `PAYTR-<date>` | no cari | `netTotal`; the PSP fee (`sales − returns − net`) goes into the body (`MASRAF_TUTARI`, `MASRAF_HESAP_KODU` = `pspFeeExpense`) and the description |
| `PayoutTransfer` becomes `completed` with money sent → `payout_transfer` | `BankRemittanceTransfer` from `mainBank` to the seller's cari, `BELGE_NO` = PayTR reference (else `transId`) | corporate (10-digit VKN) → own cari = B/K code; individual → pooled retail cari, description carries account holder + IBAN last 4 + reference | `submittedAmount` (else `netAmount`) |
| `RefundAttempt` finalized after PSP success → `refund_reversal` | `MixedReceiptsMain` with a **negative** amount (collection reversal), `BELGE_NO` = ORD-/takas number | buyer's cari by the same rule (order buyer, or the trade cash payer); `paytrClearing` | `−amount` |

The pooled-vs-corporate rule is shared with the invoice provider
(`provider/netsis-cari.ts`). Test-lane payments, zero amounts and fully
offset payouts are recorded as `skipped` with a reason, never sent.

### Mechanics

- **Record:** `NetsisSyncRecord` (`netsis_sync_records`), one row per
  `kind + sourceId` (unique `idempotencyKey` = `<kind>:<sourceId>`). Status
  `pending → processing → synced`, or `failed` / `skipped`.
- **Enqueue** (`netsis-accounting-sync.service.ts`): the outbox event
  `netsis_accounting.sync` (`netsisAccountingSyncEvent(kind, id)`) only opens
  the row. Emitters: refund finalize (order: `payment-refund.service.ts`, trade
  cash: `payment-trade-refund.service.ts`) and the PayTR settlement items stamp
  (`paytr-report-sync.service.ts`) inside their own transaction; payout
  completion (`payout.service.ts` → `applyPayoutCompletionEffects`) right after
  its status write (that path has no transaction). Invoices emit no event —
  the invoice delivery service was out of scope — so the cron sweep is their
  only path (≤ 15 min delay). The sweep (last 30 days, sources without a row,
  ordered, 200 per kind) also backstops every lost event.
- **Off switch:** with `netsis.accounting.enabled=false` or
  `INVOICE_PROVIDER≠netsis` rows are opened as `skipped`; after switching on,
  `maintenance/requeue-netsis-sync.ts --since <day>` re-queues them
  (docs/OPERATIONS.md).
- **Posting** (`netsis-accounting-posting.service.ts`, cron
  `netsis-accounting-retry`, every 15 min, worker role): claims a row under a
  10-minute lease, reloads the source, builds the body with the pure mapper
  (`netsis-accounting-mapper.ts`, Decimal), stores the body, calls
  `receipts.createCollection` / `createBankTransfer`, stores the returned key
  in `netsisRef` **before** the status. A filled `netsisRef` means "exists in
  Netsis": the next attempt marks it synced without calling Netsis. If the key
  is not in the response, `tarodan:<idempotencyKey>` is stored.
- **No blind re-posts:** Netsis has no idempotency key for these writes. A
  write whose outcome is unknown (timeout, reset, 5xx, "already exists",
  unexpected success body, or a crashed attempt whose body had been stored) is
  not retried: the row is exhausted, logged as `NETSIS_SYNC_OUTCOME_UNKNOWN`
  and raises `NETSIS_SYNC_EXHAUSTED`. Our tracking key travels in `EKACK1` so
  the record can be found in Netsis, then matched (`retry` with `netsisRef`) or
  re-queued. Connection failures that never reached Netsis (refused, DNS,
  unreachable, connect timeout, session lock, integration off) do not consume
  the budget (`netsis-sync-failure-policy.ts`).
- **Stub mode caveat:** `NETSIS_MODE=stub` keeps an in-memory store per
  process. The worker that posts accounting records does not see slips or
  caris created by the web process, so collections fail with "slip not found"
  and payouts to a cari fail validation. Keep `netsis.accounting.enabled` off
  on stub environments unless you are testing exactly this.
- **Budget:** 8 attempts; configuration problems (missing account, invalid
  corporate code, auth) exhaust it at once. Missing required accounts stop the
  whole run instead (nothing is attempted, no budget burnt).
- **Admin API** (no UI yet; `invoicing` segment → `settings` permission,
  super_admin/admin): `GET /admin/invoicing/netsis-sync` (kind/status/date
  filters, `common/list` envelope) and `POST /admin/invoicing/netsis-sync/:id/retry`
  (body `{ netsisRef? }`, required audit `netsis_sync_retry` /
  `netsis_sync_mark_synced`).

### Settings (group `account` on the invoicing settings screen)

| Key | Default | Notes |
| --- | --- | --- |
| `netsis.accounting.enabled` | `false` | Master switch; also needs `INVOICE_PROVIDER=netsis`. |
| `netsis.account.paytrClearing` | empty | PayTR clearing bank account code. Required when on. |
| `netsis.account.mainBank` | empty | Company bank account code. Required when on. |
| `netsis.account.pspFeeExpense` | empty | Optional PSP fee expense account (see open items). |

Codes are trimmed, ≤ 30 characters (`VERIFY`). `GET /admin/invoicing/settings`
returns them with `group: "account"` and a separate `accountingReadiness`
(invoice `readiness` is unaffected). Labels:
`admin.invoicingSettings.fields.{enabled,paytrClearing,mainBank,pspFeeExpense}`,
`admin.invoicingSettings.groups.account`. The admin page still has to add
`"account"` to its `SETTING_GROUPS` and show `accountingReadiness`.

### Open items for the accountant / Netsis consultant

- [ ] **Record bodies:** field names of `MixedReceiptsMain` and
      `BankRemittanceTransfer` (`CARI_KOD`, `TARIH`, `TUTAR`, `ACIKLAMA`,
      `BELGE_NO`, `BANKA_HESAP_KODU`, `KAYNAK_HESAP_KODU`, `HEDEF_HESAP_KODU`,
      `EKACK1`) and their lengths (`ACIKLAMA` assumed 50, `BELGE_NO` holds a
      16-character invoice number?). Which field carries the created record's
      key in the response (`ID`, `INCKEYNO`, `KAYITNO`)?
- [ ] **Closing an invoice on a cari:** is a collection matched to the invoice
      by `FATIRS_NO` on the receipt, or is a separate closing (kapama) record
      needed?
- [ ] **Negative collections:** is a refund a `MixedReceiptsMain` with a
      negative `TUTAR`, or a payment (tediye) / dedicated return record?
- [ ] **PSP fee record:** the gateway has no expense/fee record type; the fee
      is written as `MASRAF_TUTARI` / `MASRAF_HESAP_KODU` on the transfer and in
      its description. Which Netsis record (muhasebe fişi, masraf kaydı) should
      book it? Should settlements with `net ≤ 0` produce a transfer?
- [ ] **Seller-side fee invoices** (`seller_commission`, `seller_platform_fee`,
      `seller_shipping`, `penalty`): the money is withheld from the payout, not
      paid through PayTR. A collection into the clearing account is written for
      them as for every other invoice — or should they be offset against the
      seller's payable?
- [ ] **Seller payouts and buyer refunds carry money that never appears on a
      platform invoice** (the seller's sale proceeds). Which counter-account
      does the accountant want for those on the seller's / buyer's cari?
- [ ] **One clearing account** for both PayTR merchants (marketplace and
      membership), or one per merchant?
- [ ] **Bank transfer to a cari:** does `BankRemittanceTransfer` accept a
      `CARI_KOD` target (outgoing EFT to a cari), and must the seller's IBAN be
      on the cari card?
- [ ] **Corporate seller cari missing:** payouts assume the corporate cari
      already exists (the invoice flow opens it); a payout to a seller who was
      never invoiced fails and is retried until the cari exists.

## To verify with the Netsis consultant

- [ ] **Invoice slip fields** used by the invoicing provider (table above):
      `TIPI` values, e-document kind flag, e-Arşiv send type, time field,
      whether an externally supplied `ETTN` is accepted, the extra
      description fields (`EKACK1/2`), the return reference fields, and how
      the real recipient of a pooled retail cari is written on an e-Arşiv
      invoice. Does `STHAR_NF` stand on its own or is it derived from
      `STHAR_BF` − `STHAR_SATISK`?
- [ ] **Cari e-invoice flag**: which field `EDocCurrentUpdate` fills and
      where the PK label lives.
- [ ] **Serial numbers in a rolled-back transaction**: are they returned?
- [ ] **Calculate on a stored slip** (with `FATIRS_NO`): allowed?

- [ ] **Token request**: `POST api/v2/token`, form-encoded, fields
      `grant_type=password, username, password, dbname, dbuser, dbpassword,
      dbtype=vtMSSQL, branchcode=0`; response `{ access_token, token_type,
      expires_in }`. Typical `expires_in`? Does a new login for the same user
      invalidate the previous token?
- [ ] **Licence**: does one shared token count as one seat when used
      concurrently from several processes? Is a session safe for parallel
      requests? Does `GET api/v2/revoke` free the seat immediately?
- [ ] **Transactions**: how is `transId` attached to calls after
      `OpenTransaction` (we assume the `?transId=` query parameter)? Is a
      transaction scoped to the session — i.e. would another process's writes
      with the same token join an open transaction? (If yes, transactional
      flows must run in one worker only.) Transaction timeout?
- [ ] **Response envelope**: `{ IsSuccessful, ErrorCode, ErrorDesc, Data }` on
      every resource endpoint? HTTP status used for business errors?
      Wording for "record not found" and "duplicate number"?
- [ ] **Record ids**: is `ARPs/{id}` the `CARI_KOD` and `Items/{id}` the
      `STOK_KODU`? Which key do `ItemSlips/Details`, `/Html` and `/Delete`
      take?
- [ ] **Model field names**: containers `CariTemelBilgi`/`CariEkBilgi`,
      `StokTemelBilgi`, `FaturaTip`/`FatUst`/`Kalems`, and inside them DB-style
      names (`CARI_KOD`, `STOK_KODU`, `STHAR_GCMIK`, `STHAR_NF`, `STHAR_KDV`…)
      versus NetOpenX object names (`CariKod`, `StokKodu`, `STra_GCMIK`…).
      Settled by the `definitions/*` dumps.
- [ ] **Document type codes**: `FaturaTip` for a sales invoice (`ftSFat`?) and
      for a **sales return** (assumed: purchase invoice `ftAFat` with an iade
      `TIPI` — or a dedicated code?). `TIPI` values (open/closed/return).
- [ ] **Numbering**: body of `ItemSlips/NewEItemSlipsNumber` (assumed
      `{ SERI }`) and shape of both number responses; how e-archive serials
      are configured (`NewEArchiveNumber/{serialNo}` — per serial, per year?);
      does `POST ItemSlips` number a slip without `FATIRS_NO`?
- [ ] **Calculate**: totals fields in the response (assumed header
      `GENELTOPLAM` incl. VAT and `KDV`); VAT rounding per line or per
      document (the stub rounds per line, half-up).
- [ ] **EDocument**: request body for Send/Check/Show/Cancel (assumed the
      slip key + `ETTN`); where the ETTN and status come back; status values.
      Which integrator Netsis sends through, and is e-archive cancellation
      allowed after GİB reporting?
- [ ] **Other bodies**: EDocCurrentUpdate (single cari vs all), Queries
      (assumed `{ Query }`), MixedReceiptsMain / BankRemittanceTransfer
      required fields; Version / CompanyList shapes; REST port and TLS.
