# API (apps/api)

The platform's only backend (web, admin and mobile). Repo-wide rules are in the
[root CLAUDE.md](../../CLAUDE.md); narrower guides sit next to the code
([prisma](prisma/CLAUDE.md), auth, notification, shipping, invoicing modules)
and money rules in [.claude/rules/money.md](../../.claude/rules/money.md).

**This service moves money:** a financial behaviour no test pins does not exist,
and a value computed in two places (preview vs charge) will drift.

## Modules are bounded contexts

One domain = one module in `src/modules/<domain>/`: `*.module.ts`, controllers,
services, `dto/`, an `index.ts` barrel and **colocated `*.spec.ts`**.

- Modules talk by **injecting each other's services**, never by reading another
  domain's Prisma tables. If A needs B's data shaped B's way, B exposes a method.
- Cross-cutting mechanics (guards, filters, interceptors, validators, list
  helpers, logging, request context) live in `src/common/`; domain logic never does.
- Cross-domain side effects go through the outbox (see below) or the event bus.
- Admin is the known exception: many `admin-*` services still query Prisma
  directly. Reads may stay direct (read models); **writes go through the domain
  service**. Never add a direct-write bypass; migrate the one you touch.

### Folder layout inside a module

Past ~10 flat source files (colocated specs do not count) a module gets
subfolders, only from this vocabulary:

| Folder      | Contents                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------- |
| `dto/`      | class-validator input DTOs and response DTOs                                                 |
| `helpers/`  | no DI: `*.helper.ts`, `*.constants.ts`, `*-policy.ts`, `*.state-machine.ts`, types           |
| `jobs/`     | `*.scheduler.ts`, `*.processor.ts`: scheduled and queued work (worker role)                  |
| `<slice>/`  | services sharing one responsibility (`checkout/`, `pricing/`, `refund/`, `clients/`)         |
| module root | `<domain>.module.ts`, `<domain>.controller.ts`, the facade `<domain>.service.ts`, `index.ts` |

- At most ~8 entries per folder (`auth/`, `admin/` are the examples). No
  `services/` folder: slices are named after the responsibility.
- Moving a file keeps its name (incl. an `admin-` prefix) so `git mv` is traceable.
- `*.listener.ts` files go with their slice, not `jobs/`: listeners fire in every role.
- Still crowded means an oversized service: split it and the specs follow.
- Specs that read files outside the TS module graph (migration SQL, admin
  sources) anchor with `common/helpers/app-root.ts`, never by counting `../`.
- Tree-walking contract specs (`scheduled-processor-role`, `cron-catalog.contract`)
  recurse on purpose; keep them depth-agnostic.

## Services stay single-purpose

- Split a service past ~400-500 lines, or one you would describe with "and", by
  responsibility (`x-lifecycle`, `x-financial`, `x-query`, `x-scheduler`) behind
  a facade that only delegates and keeps every caller's signature.
- Shared steps are extracted into a `*-common.service.ts` or a pure helper, never
  copied between direct/group/guest variants. Pure computation lives in helper
  files with colocated specs.
- Worked examples: `order`, `refund`, `payment`, `invoicing`, `discount`, `auth`.
  `trade-lifecycle` (~1700 lines) is undecided: its methods are steps of one
  state machine, so agree how to slice it before extracting.

## Controllers are thin

A controller method applies decorators (auth, throttle, cache headers, Swagger),
validates input through its DTO, calls one service method and returns the
result. No Prisma calls, no business branching, no response assembly beyond the
DTO. Every endpoint has `@ApiOperation`/`@ApiResponse` (Swagger is dev-only;
`ENABLE_SWAGGER` gates the rest). Never swallow errors into an empty 200.

## DTOs and validation

- The global `ValidationPipe` runs with `whitelist: true` + `transform`:
  undeclared fields are dropped, so the DTO is the contract.
- Cross-app rules come from the shared source, never re-typed: `@IsTrPhone`,
  `@IsPassword`, TR IBAN (`src/common/validators`, backed by `@tarodan/types`).
  A rule web, admin and API must agree on lives in `@tarodan/types`.
- Responses are DTO- or mapper-shaped; never return a raw Prisma entity
  (`StripSensitiveFieldsInterceptor` is defence in depth, not the plan).
- A change visible to mobile needs a contract delta ([packages/types](../../packages/types/CLAUDE.md)).

## Prisma discipline

- `PrismaService` is the only database entry point.
- **`$transaction` is mandatory** when one business event writes more than one
  row (money, stock, escrow, state transitions with side tables).
- **Nothing slow or fallible inside a transaction:** no HTTP, mail or queue
  publish. Record an outbox row inside the transaction instead.
- Concurrency is deliberate; copy an existing money-path pattern: optimistic
  `version` + `{ increment: 1 }`, `SELECT ... FOR UPDATE` for hot rows,
  `Serializable` only where proven necessary.
- Query only what you return: `select` over broad `include`; no N+1 on lists.
- Raw SQL is fine for reporting, parameterised, in the owning domain's service.

## Lists and pagination

New list endpoints use `src/common/list` only: `paginate`, `resolveOrderBy`
(DMMF- and type-aware, so a sort on a `Json` or `String[]` column cannot 500),
`buildSearchWhere`, `AdminListQueryDto`, `date-range`. `paginate` also fixes the
defaults (page 1, limit 20), the cap (`ADMIN_LIST_MAX_LIMIT`, 500) and the
envelope `{ data, meta: { total, page, limit, totalPages } }`. Migrating a
hand-rolled site is behaviour-preserving only if it already agrees on all three;
otherwise leave it and say why.

## Errors are semantic and localised

Throw the honest Nest exception (`NotFound`, `Forbidden`, `Conflict`, ...) with a
catalog key, never a literal (`@tarodan/no-hardcoded-exception-message` is an error):

```ts
throw new BadRequestException(
  i18nMessage("server.order.notFound", { orderNumber }),
);
```

`AllExceptionsFilter` renders the key in the request locale, keeps the
`{ statusCode, message, error }` contract, exposes `i18nKey`, maps Prisma errors
to 4xx and sanitises 5xx. Services never touch the locale. New keys need `tr`
and `en` ([packages/i18n/CLAUDE.md](../../packages/i18n/CLAUDE.md)).

## Money

Non-negotiable in every money path (payment, order, refund, payout, ledger,
commission, discount, trade cash, membership, boost, tax, invoicing):

- `Decimal` in schema and math; `.toNumber()` only at the response boundary.
- **One formula, one place:** preview and charge call the same function.
- **Snapshot at charge:** history renders from frozen columns, never today's rules.
- **Idempotent at the database:** deterministic ledger keys, CAS claim stamps.
- **Append-only ledger:** corrections are new entries.
- **Tests are mandatory:** a behaviour-pinning spec before and after; senior work.

Details: [.claude/rules/money.md](../../.claude/rules/money.md) (loaded for
money paths); full spec: `docs/PAYMENTS.md`.

## AuthN and AuthZ

Default closed. The global guard chain (BlockedIp -> Throttler -> Csrf -> JwtAuth
-> BannedUser) protects every route; `@Public()` opts out on purpose.
Authorization is declarative (`@Roles`, `@RequirePermission`, `@AdminRoute`);
services own ownership checks ("is this your order?"). Hand-rolled role checks
in services are a smell. Details: [src/modules/auth/CLAUDE.md](src/modules/auth/CLAUDE.md).

## Side effects go through the outbox

"When X commits, also do Y" (mail, push, invoice, ledger, search sync) is an
**outbox event** written in X's transaction and handled after commit by a
registered handler. Delivery is at-least-once, so **every handler is
idempotent** (natural key or claim stamp). Direct fire-and-forget calls are only
for effects whose loss is acceptable; anything financial or user-visible if
missing goes through the outbox.

## Process roles and background work

The same build runs as `PROCESS_ROLE=all | web | worker`; never assume your code
shares a process with HTTP.

- Queue consumers live in `src/workers/`; `*-scheduled.processor.ts` jobs run in
  the worker role. `BullRootModule` loads everywhere (web still enqueues).
- Every scheduled job is idempotent and re-runnable, registers in
  `src/workers/cron-catalog.ts` (monitoring and Sentry check-ins), uses a bounded,
  **ordered** candidate query, and claims its work so two instances cannot
  double-process. Cron keys are bound to Bull and Sentry: renaming one is an ops step.

## Logging and Sentry

`error` is an alarm and reaches Sentry; `warn` is "watch this" and does not.
(tarodan-ops: `docs/observability.md`.)

- An `error` log line reaches Sentry **once per repeat-report key per ~20h**,
  shared through Redis by every process (`common/logging/error-report-key.ts`,
  `modules/sentry/sentry-report-throttle.ts`); the console logs every
  occurrence. The key keeps the entity and drops counters and durations, so
  **name the entity in the message** (UUID, reference code, `id=...`): another
  entity, or another reason, is reported at once. HTTP 5xx captured by
  `SentryInterceptor` are never throttled.
- **One failure, one alarm in crons.** A per-record failure logs at `warn`
  and its id goes into the run summary, which is the alarm. A step that
  throws logs its own `error`; a summary made only of those is
  `CronStepFailuresError(..., alreadyReported = true)` and the cron tracker
  logs it at `warn`. A cron that rethrows to the tracker does not also log
  the same failure at `error`: the tracker reports it with its stack.

## Configuration

- Deploy-time env goes through `config/env.validation.ts`; production boot fails
  fast on missing or placeholder secrets and dangerous flags (`PAYMENT_BYPASS`).
  A new env var is added to the validator with its production requirement.
- **No `process.env` in modules** (`@tarodan/no-raw-process-env` is an error):
  read config through a `src/config/` accessor. The rule's allow list only shrinks.
- Admin-changeable values (fees, day counts, toggles) live in `PlatformSetting`
  or "Süreler ve Kurallar" (`docs/TIMING_RULES.md`), not in code constants, so a
  change needs no deploy. Membership-derived features come only from Membership Tiers.
- New external side effects (money, invoice, cargo) are gated on the test lane
  (`isTest`, `modules/account-lane/`).

## Schema and migrations

See [prisma/CLAUDE.md](prisma/CLAUDE.md): comment non-obvious columns, additive
migrations, separate backfills, `onDelete: Restrict` for financial and audit rows.

## Types and tests

`strict` is on (except `strictPropertyInitialization`). An `any` voids it locally:
type the shape or take `unknown` and narrow. A non-null `!` is a claim, not a
check: narrow into a local, use a type predicate or fix the signature.

- New behaviour lands with a colocated spec; money, state transitions and
  authorization never ship untested. A bug fix starts with a red test named
  after the failure.
- System invariants have contract specs (`*-contract.spec.ts`: guard pairing,
  permission-map coverage, release and runtime contracts). Change one only on
  purpose.
- Cross-service flows go in `test/integration`, full HTTP paths in `test/e2e`
  (isolated `.env.test` DB via `test:e2e:setup`), built from `test/factories`
  and the scenario catalogue (`test/scenarios/manifest.json`).

## Fix what you touch

Approved, behaviour-preserving cleanups. In any file you touch, in a separate
`refactor(api):` commit that keeps the suite green:

1. **Explicit `any`:** replace with a real type or `unknown` + narrowing.
2. **List infra:** replace hand-rolled `skip`/`take`/`orderBy` with
   `common/list` when the semantics are identical.
3. **Admin writes:** route through the domain service (extract the shared core first).
4. **Env reads:** move an allow-listed key to a `src/config/` accessor and drop
   it from the `no-raw-process-env` allow list.

### Known, undecided

Open questions; each fix changes behaviour, so decide first:

- **Undeclared env keys are dropped.** The zod env schema strips unknown keys,
  so a key in an `.env` file but not in `config/env.validation.ts` never
  arrives and the inline fallback wins (`TARODAN_WAREHOUSE_*`,
  `WEB_REVALIDATE_URL`, `REVALIDATE_SECRET`, `CARGO_*`, `LOG_LEVEL`, ...). They
  work only as real environment variables.
- **List responses come in six shapes** (`{data, meta}`, flat, `items`,
  `results`, `threads`, bare `data`). Converging them is a contract change for
  web, admin and mobile.
- **PayTR return URLs have no fallback**: with `FRONTEND_URL` unset they render
  as `undefined/payment/success`. Payment-critical, left as is.

Resolved, do not reopen: the warehouse address has one resolver,
`WarehouseAddressService` (`modules/shipping/warehouse/`).

## Verification

```bash
pnpm --filter @tarodan/api typecheck                      # src + test/ + scripts/
pnpm --filter @tarodan/api lint
cd apps/api && npx jest <paths> --maxWorkers=2            # targeted specs
pnpm --filter @tarodan/api test:integration               # when flows change
pnpm --filter @tarodan/api test:e2e                       # needs test:e2e:setup
```

`pnpm --filter <pkg> test -- <flag>` passes the flag as a path pattern; use
`npx jest` inside `apps/api` for flags. Read the output, not the exit code.

## Domain references

Business rules live in `docs/`: `PAYMENTS.md`, `SHIPPING.md`, `OPERATIONS.md`
(environments, runbooks, CI), `CODE_SCHEME.md` (codes and refs), `IDENTITY.md`,
`CONSENTS.md`, `USER_BLOCKING.md`, `TIMING_RULES.md`, `MAIL_ROUTING.md`,
`INVOICING_PROVIDERS.md`, `PCI_PAYMENT_PAGE.md`. Read them, do not duplicate them.
