# tarodan-app

pnpm + Turborepo monorepo for the Tarodan marketplace: the NestJS API, the
Next.js storefront and admin panel, and the shared `@tarodan/*` packages. The
mobile app is the separate `tarodan-mobile` repo. Cross-repo rules (process,
releases, contracts, parity, backlog) live in the private hub **tarodan-ops**;
this file summarises what applies here so it stands alone, and cites the hub as
"tarodan-ops: <path>". Folder guides hold the engineering detail.

**Language:** all content is English (code, comments, commits, branches, PRs,
docs, guides). Replies to the user are in Turkish. Existing Turkish text may
stay until you touch it.

## Monorepo map

| Path                     | What                                                                                                                             | Guide                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`               | `@tarodan/api`: NestJS + Prisma + BullMQ, the only backend                                                                       | [CLAUDE.md](apps/api/CLAUDE.md), [prisma](apps/api/prisma/CLAUDE.md)                                                                                                                                                 |
| `apps/api/src/modules/*` | auth (+ identity, consents, blocking), notification, shipping (+ surat-cargo), invoicing                                         | [auth](apps/api/src/modules/auth/CLAUDE.md), [notification](apps/api/src/modules/notification/CLAUDE.md), [shipping](apps/api/src/modules/shipping/CLAUDE.md), [invoicing](apps/api/src/modules/invoicing/CLAUDE.md) |
| money modules            | payment, payment-providers, order, refund, ledger, payout, commission, discount                                                  | [.claude/rules/money.md](.claude/rules/money.md)                                                                                                                                                                     |
| `apps/web`               | `@tarodan/web`: public storefront, Next.js App Router                                                                            | [CLAUDE.md](apps/web/CLAUDE.md)                                                                                                                                                                                      |
| `apps/admin`             | `@tarodan/admin`: admin panel, fully client-side                                                                                 | [CLAUDE.md](apps/admin/CLAUDE.md)                                                                                                                                                                                    |
| `packages/ui`            | `@tarodan/ui`, `@tarodan/ui/form`                                                                                                | [CLAUDE.md](packages/ui/CLAUDE.md)                                                                                                                                                                                   |
| `packages/design-tokens` | the one token set (web, admin, mobile)                                                                                           | [CLAUDE.md](packages/design-tokens/CLAUDE.md)                                                                                                                                                                        |
| `packages/i18n`          | tr/en catalog, `MessageKey`                                                                                                      | [CLAUDE.md](packages/i18n/CLAUDE.md)                                                                                                                                                                                 |
| `packages/types`         | the live API contract                                                                                                            | [CLAUDE.md](packages/types/CLAUDE.md)                                                                                                                                                                                |
| `packages/*`             | `shared` (status configs), `auth`, `api-client`, `listing-form`, `logger`, `brand`, `eslint-config`, `eslint-plugin`, `tsconfig` | `package.json`                                                                                                                                                                                                       |
| `scripts`, `.github`     | verification, pre-push, CI/CD and deploy                                                                                         | [scripts](scripts/CLAUDE.md), [.github](.github/CLAUDE.md)                                                                                                                                                           |
| `docs`                   | domain references (`PAYMENTS.md`, `OPERATIONS.md`, ...)                                                                          | linked from the guides                                                                                                                                                                                               |

## Principles

- SOLID, DRY, KISS, YAGNI. **One source of truth** for every rule, value, type
  and string; before writing a helper, assume it exists and find it.
- Official current practice of NestJS, Next.js App Router and Turborepo.
- **Fix what you touch** in the same change; if that would greatly expand the
  scope, add it to tarodan-ops: `backlog.md`. No separate cleanup audits.
- When code and a doc disagree, stop and reconcile; never encode a third opinion.

## Turborepo

- **Apps never import each other**; dependencies go apps -> packages only.
  Shared code moves into a package named `@tarodan/*` (`workspace:*`).
- Keep `turbo.json` caching correct: a new source folder or config a task reads
  goes into its `inputs`; config-only packages into `globalDependencies`; build
  outputs into `outputs`. A stale cache hides real errors.
- A runtime `@tarodan/*` dependency of the API must be built and copied in the
  API `Dockerfile`, or production boots into `MODULE_NOT_FOUND`; runtime code
  the API needs belongs in `@tarodan/types`.
- Boundaries are enforced by review; there is no boundary lint yet.

## Frontend (web and admin)

The app guides add only what differs (web: per-route rendering, cards; admin:
tables, CRUD).

- **Thin pages, logic in hooks** (~150 lines per page). Data, submission and
  effects in `_hooks/` or `src/hooks/`; types, schemas, options in `_lib/`;
  dialogs in `_modals/`. `_` folders are route-private; a second user moves the
  code up. React context only for state truly shared by a subtree.
- **Components come from `@tarodan/ui`.** Raw `<button>`, `<input>`, `<select>`,
  `<textarea>` are lint errors (`type="file"` excepted). A missing variant goes
  into `@tarodan/ui` first. Composition over long prop lists. Do not re-pass a
  component's built-in default classes.
- **Tokens only:** semantic classes from the shared Tailwind preset; no raw
  palette, no `white`/`black` utilities, no hex or rgba. **Light theme only.**
- **React Query is the only server state.** Never `useState` + `useEffect` +
  API. Mutation hooks own the toast and invalidation (no manual `refetch()`).
  Query keys come from `lib/query/keys.ts`; inline key arrays are lint errors.
  zustand holds client state only.
- **Forms are RHF + zod** (`useZodForm`, `FormModal`, `Form*` wrappers from
  `@tarodan/ui/form`); schemas in `_lib/`; zod validates, the `mutationFn`
  shapes values. Destructive actions use `useConfirm`.
- **Copy from `@tarodan/i18n`**, `tr` and `en`, one key per string
  (`@tarodan/no-hardcoded-turkish` is an error). Dates, money and numbers go
  through `lib/format.ts`.
- **TR phone numbers only** (`+905XXXXXXXXX`): `trPhone`, `FormPhone`,
  `combinePhone`; the API checks `@IsTrPhone`. Never a local regex.
- Shared config is upstream (`@tarodan/tsconfig`, the tokens preset,
  `@tarodan/eslint-config`). Touching a package means typechecking its consumers.

## Backend

One NestJS service: bounded-context modules in `apps/api/src/modules/`, thin
controllers, class-validator DTOs, Prisma as the only DB entry point,
i18n-keyed exceptions, default-closed auth, an outbox for side effects. It moves
money, so behaviour-pinning tests are mandatory. Read
[apps/api/CLAUDE.md](apps/api/CLAUDE.md) before any API change.

## Design system, contracts, parity

- `packages/design-tokens` is the single token source for web, admin **and
  mobile**. No ad-hoc colours, sizes or variants: add to the shared layer
  first. A token change needs a note in tarodan-ops: `docs/design-system.md`
  and a mobile sync.
- `packages/types` is the live contract. An API change visible to mobile adds a
  delta in tarodan-ops: `contracts/deltas/` and stays backward compatible
  (tarodan-ops: `contracts/README.md`, `compat.md`).
- Web and mobile behave the same unless a store rule forces otherwise; parity is
  tracked in tarodan-ops: `parity/matrix.md`.

## Commits and branches

Full rules: tarodan-ops: `docs/commit-and-branch-rules.md` (enforced by
`commitlint.config.js` and the pre-push hook).

- Conventional Commits, English, ASCII header.
  Types: `feat fix refactor perf docs test chore build ci`.
  Scopes: `api`, `web`, `admin`, `ui`, `types`, `i18n`, `design-tokens`,
  `auth`, `shared`, `infra`, `ci`, `deps`, `release`, `scripts`; comma-joined
  across areas (`fix(api,i18n): ...`).
- Subject imperative, lower case, at most 72 characters, no period; the body
  explains why. No `Co-Authored-By` trailer, no "Generated with" footer.
- Focused commits, never `git add -A` blindly, never `--no-verify`, never
  `git stash` (use `git show HEAD:<path>`), never force-push.
- Branches `<type>/<kebab-description>` (types above minus `build`, plus
  `hotfix`). Merges are `--no-ff` merge commits, never squash.

## Verification

1. **pre-commit:** lint-staged (`eslint --fix` + `prettier` on staged files).
2. **commit-msg:** commitlint.
3. **pre-push:** branch-name check; `development` pushes typecheck the affected
   apps (+ web/admin `test:api`) one at a time; no jest.
4. **CI:** staging gate = typecheck + lint; unit tests advisory on every
   development push (fix red forward); `master` PRs and the production release
   run the full gate (all unit tests, build, audit).

Locally: `pnpm verify:push [--tests]`, `pnpm verify:quick`, `pnpm verify:ci`.
During agent work run only the relevant tests with `--maxWorkers=2`, one `tsc`
at a time. Details: [scripts/CLAUDE.md](scripts/CLAUDE.md), `docs/OPERATIONS.md`.

## Release

- `development` deploys **staging**; every push needs the user's approval.
- `master` is **production**, changed only by a PR from `development` or
  `hotfix/*` (merged back). The production freeze is active
  (tarodan-ops: `decisions/0010-production-freeze.md`).
- Deploy order web -> API -> mobile; flags flip only after mobile supports them;
  post-deploy scripts follow `docs/OPERATIONS.md`, dry run first.

## Security

**This repo is public.** Never commit secrets, tokens, real env values,
customer or personal data, dumps or signing material; only variable names and
public placeholders. Logs carry ids, never PII or tokens.
Policy: tarodan-ops: `docs/security-policy.md`.

## Claude Code and Definition of Done

- Versioned: `.claude/settings.json` (permissions, hooks), `agents/`, `skills/`,
  path-scoped `rules/`. `settings.local.json` stays personal. Agents work in
  their own worktree and branch, commit their own work, never push or merge,
  and never use the `fable` model.
- Done means tarodan-ops: `docs/definition-of-done.md`: principles followed,
  touched violations fixed, lint and `tsc` clean, relevant tests green,
  important review findings resolved, commit rules followed, English content,
  no secrets in the diff.
