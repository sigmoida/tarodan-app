# API — Backend Principles

Guidance for building the NestJS API in `apps/api` — the platform's single
backend: the storefront, the admin panel and the mobile app all talk to it.
Read this before adding modules, endpoints, or background jobs. Rules are
enforced partly by tooling (ESLint, contract specs) and partly by review.

The bar is the same as web/admin — one canonical way to do each recurring
thing, one source of truth per fact, patterns that hold at 100 modules as well
as at 50 — plus one rule the frontends don't have: **this service moves money**.
A financial behavior that isn't pinned by a test does not exist; a value that
can be computed in two places (preview vs charge, admin vs storefront) will
drift. Before writing a helper, assume it already exists and go find it — at
this codebase's size it almost always does.

## 1. Modules are bounded contexts

One domain = one module under `src/modules/<domain>/` (`order`, `payment`,
`refund`, `trade`, `membership`, …), each with `*.module.ts`, controllers,
services, `dto/`, an `index.ts` barrel, and **colocated `*.spec.ts`** next to
what they test.

- Modules talk to each other by **injecting each other's services** — never by
  reaching into another domain's Prisma tables. If module A needs module B's
  data shaped B's way, B exposes a method for it.
- Cross-cutting mechanics (guards, filters, interceptors, validators, list
  helpers, upload limits, logging, request context) live in `src/common/` —
  domain logic never does.
- Side effects across domains go through the **outbox** (§10) or the event
  bus, not through a growing web of direct service calls inside transactions.
- **Admin is the known exception being unwound**: many `admin-*` services still
  query Prisma directly. Reads (reports, dashboards, list views) may stay
  direct — they are read-models. **Writes must go through the domain service.**
  Don't add new direct-write bypasses; when you touch one, migrate it (§15).

### Folder layout inside a module

A module folder is a table of contents. Once it passes **~10 flat files** it
stops being one, so it gets subfolders — and only from this vocabulary, so
every module reads the same way:

| Folder      | What belongs in it                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `dto/`      | class-validator input DTOs and response DTOs                                                            |
| `helpers/`  | anything with no DI: `*.helper.ts`, `*.constants.ts`, `*-policy.ts`, `*.state-machine.ts`, type files   |
| `jobs/`     | `*.scheduler.ts` and `*.processor.ts` — scheduled and queued work, gated to `PROCESS_ROLE=worker` (§11) |
| `<slice>/`  | services sharing one responsibility: `checkout/`, `pricing/`, `refund/`, `reconciliation/`, `clients/`  |
| module root | `<domain>.module.ts`, `<domain>.controller.ts`, the facade `<domain>.service.ts`, `index.ts`            |

The test: opening the folder shows **at most ~8 entries**, and each one says
what it is without opening it. `auth/` (dto, decorators, guards, strategies,
interfaces, utils) and `admin/` (catalog, users, orders, trade, finance,
analytics, ops, jobs) are the worked examples.

- Moving a file is not a rename. Keep the filename — including its `admin-`
  prefix — so `git mv` stays traceable and the file still matches its class.
- A slice is named after the **responsibility**, never after the technical kind.
  There is no `services/` folder: it would tell a reader nothing they didn't
  already know.
- `*.listener.ts` files go **with their slice, not in `jobs/`**. All three in
  the codebase are registered unconditionally and fire wherever the event is
  emitted — including the web role — so filing them as background work would
  say something untrue about when they run.
- Contract specs that walk the tree (`scheduled-processor-role`,
  `cron-catalog.contract`) recurse on purpose. Keep them depth-agnostic — a
  spec that reads one level deep silently stops covering anything you move.

## 2. Services stay single-purpose — split before they grow

The `order` module is the canonical shape: `order-pricing`,
`order-checkout-direct` / `-group` / `-guest`, `order-lifecycle`,
`order-query`, with shared steps in `order-checkout-common` and pure math in
`order-*.helper.ts` files. Nobody has to read 3000 lines to change one rule.

- A service past ~400–500 lines, or one you'd describe with "and", gets split
  by responsibility (`x-lifecycle`, `x-financial`, `x-query`, `x-scheduler`).
- Shared steps are **extracted** into a `*-common.service.ts` or a pure
  helper — never copied between the direct/group/guest variants of a flow.
- Pure computation (pricing math, deadlines, state predicates) goes in plain
  helper files with colocated specs — trivially testable without Nest wiring.
- The `refund` module is the worked example of getting there: one 3167-line
  service became five with a single job each — `refund-creation`,
  `-financial`, `-shipment`, `-decision`, `-notification` — behind a 258-line
  `refund.service.ts` that only delegates. Callers never changed, because the
  facade keeps every signature they knew. Read that split before doing another.
- `payment` went the same way: hold release, the refund-attempt ledger and
  trade cash refunds are their own services, so `payment-refund.service.ts`
  (2331 → 1126) now does one job — refunding an order.
- The ones still waiting: `elogo-invoicing` (2316), `discount` (2086),
  `auth` (1835). Don't extend them; extract from them (§15).

## 3. Controllers are thin

A controller method does four things: apply decorators (auth, throttle, cache
headers, Swagger), validate input via its DTO, call one service method, return
the result. No Prisma calls, no branching business rules, no response
assembly beyond the DTO.

- Every endpoint carries `@ApiOperation`/`@ApiResponse` — Swagger is the
  endpoint inventory (dev-only serving; `ENABLE_SWAGGER` gates the rest).
- Don't swallow errors into empty-but-200 responses; let the exception filter
  do its job. (One legacy endpoint does this — it is not a precedent.)

## 4. DTOs & validation — one rule, defined once

Input DTOs use `class-validator` and live in the module's `dto/`. The global
`ValidationPipe` runs with `whitelist: true` + `transform`, so DTOs are the
contract — anything not declared is silently dropped.

- Cross-app rules come from the shared source, never re-typed locally:
  `@IsTrPhone` (from `src/common/validators` / `@tarodan/types`), TR IBAN, etc.
  If web, admin and API must agree on a rule, it lives in `@tarodan/types`.
- Responses are DTO/mapper-shaped. Never return a raw Prisma entity — the
  `StripSensitiveFieldsInterceptor` is defense-in-depth, not the plan.

## 5. Prisma discipline

`PrismaService` is the only database entry point.

- **`$transaction` is mandatory** when one business event writes more than one
  row (money movement, stock, escrow, any state transition with side tables).
- **Nothing slow or fallible inside a transaction**: no HTTP calls, no mail,
  no queue publishes. Side effects are recorded to the outbox row _inside_ the
  tx and executed _after_ commit by the drainer.
- Concurrency is handled deliberately, pick the tool: optimistic `version` +
  `{ increment: 1 }` (orders), `SELECT … FOR UPDATE` for hot rows, and
  `Serializable` isolation only where proven necessary. Copy an existing
  money-path pattern rather than inventing a new one.
- Query only what you return: prefer `select` over broad `include`; watch for
  N+1 in list paths.
- Raw SQL is legitimate for reporting/aggregation — parameterized, in the
  service that owns the domain.

## 6. Lists, pagination, sorting — `src/common/list` only

New list endpoints never hand-roll `skip`/`take`/`orderBy`. Use the shared
infrastructure: `paginate`, `resolveOrderBy` (DMMF-driven and type-aware — it
is what keeps a sort on a `Json`/`String[]` column from becoming an HTTP 500,
see #402), `buildSearchWhere`, `AdminListQueryDto`, `date-range`.

`paginate` is not only a `skip`/`take` helper: it fixes the defaults (page 1,
limit 20), the cap (`ADMIN_LIST_MAX_LIMIT`, 500) **and the response envelope**
(`{ data, meta: { total, page, limit, totalPages } }`). So a migration is only
behavior-preserving when the call site already agrees on all three. Check
before you move one — an endpoint defaulting to 50, or returning `items`
instead of `data`, changes what its clients receive.

Sixteen hand-rolled sites remain for exactly that reason (see "Known,
undecided" in §15). Migrate one when you touch it **and** it matches; otherwise
leave it and say why.

## 7. Errors are semantic and localized

Throw Nest's semantic exceptions (`NotFound` vs `Forbidden` vs `Conflict` —
pick honestly), with a **catalog key, not a literal string**:

```ts
throw new BadRequestException(
  i18nMessage("server.order.notFound", { orderNumber }),
);
```

`AllExceptionsFilter` renders the key in the request's locale, keeps the
`{ statusCode, message, error }` contract, exposes `i18nKey`, maps Prisma
errors to clean 4xx, and sanitizes unhandled 5xx. Services never touch the
locale. A literal message string is an **ESLint error**
(`@tarodan/no-hardcoded-exception-message`): every exception in the codebase
carries a key, and the catalog keeps `tr` and `en` in exact parity, so a new
key needs both values.

## 8. Money

- Money is `Decimal` in the schema and `Prisma.Decimal` in computation;
  `.toNumber()` only at the response boundary. `Float` is reserved for
  non-financial scores.
- **One formula, one place.** Pricing/commission/shipping/coupon math lives in
  `order-pricing` + its helpers (`order-charged-base.helper` defines the base
  everything derives from). Preview and checkout call the **same** function —
  a "display copy" of a formula is a future incident, not a convenience.
- **Snapshot at charge time.** Rules change; charged orders must not. Money
  columns + `financialSnapshot` freeze the outcome; render history from the
  snapshot, never by re-running today's rules.
- **Idempotency at the database.** Ledger writes carry a deterministic
  `idempotencyKey` (+ `lineNo` unique); one-shot events get claim timestamps
  (`*ReleasedAt`, `*InvoicedAt`) checked-and-set atomically. Retries and
  replays must be free.
- The double-entry ledger is append-only. Corrections are new entries, never
  updates.

## 9. AuthN/AuthZ — default closed, opt out explicitly

The global guard chain (BlockedIp → Throttler → Csrf → JwtAuth → BannedUser)
protects every route. Authorization is **declarative**:

- `@Public()` opens a route; `@CurrentUser()` injects the caller;
  `@Roles`/`@RequirePermission`/`@AdminRoute` gate admin surfaces. Hand-rolled
  `if (user.role === …)` checks in services are a smell — the decorator +
  guard layer owns access; services own ownership checks (is this _your_
  order?) which are business rules.
- Auth cookies are httpOnly and named in one place (`auth-cookies.ts`);
  browser cookie auth is CSRF-protected (double-submit, timing-safe); bearer
  tokens serve native/BFF clients. Don't add a second cookie convention.
- Sensitive endpoints add their own strict `@Throttle` on top of the global
  limit (login 5/min is the pattern) — contract specs pin these; keep them
  passing.

## 10. Side effects go through the outbox

"When X commits, also do Y" (mail, push, invoice, ledger, search sync) is an
**outbox event** written in the same transaction as X, handled by a registered
handler after commit. Delivery is at-least-once, so **every handler is
idempotent** — guard with the natural key or a claim stamp, not with hope.

Direct fire-and-forget calls from inside a request are only for effects whose
loss is acceptable; anything financial or user-visible-if-missing goes through
the outbox.

## 11. Process roles & background work

The same build runs as `PROCESS_ROLE=all | web | worker` — never assume your
code shares a process with HTTP.

- Queue consumers live in `src/workers/`; `*-scheduled.processor.ts` cron-like
  jobs run in the worker role. `BullRootModule` loads everywhere (web still
  enqueues); `WorkerModule` only where jobs are consumed.
- Every scheduled job is **idempotent and re-runnable**, registers with the
  cron catalog/tracker (that's the monitoring + Sentry check-in surface), uses
  a bounded, ordered candidate query (an unordered `take: 500` scan once
  silently starved orders of invoices), and claims its work so two instances
  can't double-process.

## 12. Configuration

- Deploy-time env goes through `config/env.validation.ts` — production boot
  **fails fast** on missing/placeholder secrets, and dangerous flags are
  boot-guarded (`PAYMENT_BYPASS`). New env vars are added to the validator
  with their production requirements, not just read ad hoc.
- **No `process.env` reads inside modules** — inject `ConfigService` (or a
  typed helper) so tests can vary it and validation stays authoritative.
  Existing direct reads are under migration (§15).
- Runtime-changeable settings (fees, day-counts, toggles) live in
  `PlatformSetting`/`app-config` — settings an admin flips must not require a
  deploy. Membership-derived features come **only** from Membership Tiers;
  settings cannot override them.

## 13. Schema & migrations

- Every column that isn't self-evident carries a comment saying **why** it
  exists (see the `Order` model — that standard). Snapshots, claim stamps and
  back-compat totals are documented at the column.
- Migrations are additive and deployed with `prisma migrate deploy`; data
  backfills are separate scripts, not squeezed into schema migrations.
- Think before `onDelete: Cascade` — anything financial or audit-relevant is
  `Restrict`.
- Seeds are layered (reference / launch / demo) with `:prod` scripts built via
  `build:seed`; new reference data goes into the right layer, not into an
  existing dump.

## 14. Type discipline & tests

**`strict` is on**, with `strictPropertyInitialization` the single deliberate
exception (class-validator DTOs and Prisma entities are populated by decorators
and the ORM). So the compiler already enforces what the schema declares: every
nullable column and every `findUnique` result is handled at the boundary.

Two things it cannot do for you:

- **`any` voids it locally.** An `any` value satisfies every null check
  silently, and 943 remain in source. Don't add one — type the shape, or take
  `unknown` and narrow. Removing the existing ones is its own phase.
- **A non-null assertion is a claim, not a check.** If `!` is the only way
  through, the guarantee is missing somewhere: capture the narrowed value in a
  local (narrowing does not survive into a closure), give the guard a type
  predicate so it crosses a function boundary, or state the nullability in the
  signature.

**Test culture is the backbone — keep it:**

- New behavior lands with a colocated `*.spec.ts`; money, state transitions
  and authorization changes never ship untested.
- Bug fixes start with a red test named after the failure.
- System invariants get **contract specs** (`*-contract.spec.ts`: guard
  pairing, permission-map coverage, release/runtime contracts) — they are what
  lets refactoring be safe here. If you change an invariant, change its
  contract spec deliberately, not incidentally.
- Cross-service flows → `test/integration`; full HTTP paths → `test/e2e`
  (isolated `.env.test` DB via `test:e2e:setup`). Use the shared
  `test/factories` + `scenarios`, don't hand-build entities.

## 15. Active migrations — boy-scout rules

These are approved, behavior-preserving cleanups. **In any file you touch:**

1. **Explicit `any`** — replace the ones in the file you're editing with a real
   type or `unknown` + narrowing (943 left in source, ~1900 more in specs).
2. **List infra** — replace hand-rolled `skip`/`take`/`orderBy` with
   `common/list` helpers when semantics are identical.
3. **Admin writes** — route admin write paths through the domain service; if
   the domain method doesn't exist, extract the shared core first.
4. **Env reads** — read config through a `src/config/` accessor.
   `@tarodan/no-raw-process-env` is already an **error**: everything not on its
   allow list has an accessor, so a new raw read is a regression. Giving an
   allow-listed key an accessor means taking it off that list — the list only
   shrinks.

Never mix these cleanups into a feature commit — separate `refactor(api):`
commits, each leaving the suite green.

### Known, undecided

Not migrations — open questions that need a decision before anyone "fixes" them
in passing, because each one changes behavior:

- **Undeclared env keys are silently dropped.** `ConfigModule` validates env
  through a zod schema that strips unknown keys, and only the survivors are
  written back to `process.env`. A key that lives in an `.env` file but is not
  in `config/env.validation.ts` never arrives — the inline fallback wins
  instead. Several keys are in this state today (`TARODAN_WAREHOUSE_*`,
  `WEB_REVALIDATE_URL`, `REVALIDATE_SECRET`, `CARGO_*`, `LOG_LEVEL`, …); they
  work only where injected as real environment variables. Declaring them makes
  their configured values start taking effect.
- **List responses come in six shapes.** `{data, meta{}}` is the `paginate`
  envelope and the most common, but the API also returns a flat
  `{data, total, page, limit, totalPages}`, `{items, …}`, `{results, …}`,
  `{threads, …}` and bare `{data}`. Every client has to handle whichever shape
  its endpoint happens to use. Converging them is an API change with a
  migration for web, admin and mobile — worth doing, but as its own decision.
- **PayTR's return URLs have no fallback** — if `FRONTEND_URL` is unset they
  render as `undefined/payment/success`. Payment-critical, so left as-is.
- **The warehouse address exists twice, by different mechanisms.** Inbound trade
  legs and refund returns write it out as text from `config/warehouse.ts`
  (env); outbound and return shipments take an Address row resolved from the
  `warehouse_address_id` platform setting (admin Settings, health-checked).
  Moving the warehouse in admin leaves the env copy stale while the health check
  stays green. Unifying them means picking a winner and reworking the callers
  that need text rather than an id.

## 16. Verification

Run from the repo root before calling a change done:

```bash
pnpm --filter @tarodan/api typecheck        # src + test/ + scripts/
pnpm --filter @tarodan/api lint
pnpm --filter @tarodan/api test             # colocated unit/spec suite
pnpm --filter @tarodan/api test:integration # cross-service flows
pnpm --filter @tarodan/api test:e2e         # full HTTP (needs test DB: test:e2e:setup)
```

- Schema changed? `prisma migrate dev` locally; remember the deploy needs
  `migrate deploy` (see docs/OPERATIONS.md).
- New runtime dependency on a `@tarodan/*` package? The **Dockerfile must
  build it in the builder stage and COPY it into the runner's
  `node_modules/@tarodan/`** — otherwise production boots into
  `MODULE_NOT_FOUND` while local dev works fine.
- Touched a shared package? Typecheck its other consumers (web/admin) too.

## Domain reference — read, don't duplicate

Business rules live in `docs/`, not here: `PAYMENTS.md`, `SHIPPING.md`,
`OPERATIONS.md` (launch/reset runbook), `CODE_SCHEME.md` (B/K/U codes,
ORD-/TKS- refs), `IDENTITY.md`, `PCI_PAYMENT_PAGE.md`. When code and doc
disagree, stop and reconcile — don't encode a third opinion.
