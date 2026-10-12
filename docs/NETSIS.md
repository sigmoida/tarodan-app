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
`docs/INVOICING_PROVIDERS.md` → "Netsis adaptörü".

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
