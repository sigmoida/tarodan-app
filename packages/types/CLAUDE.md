# @tarodan/types (packages/types)

**The live API contract.** Request and response shapes, enums, status lists and
the validation rules that the API, web, admin and mobile must agree on (phone,
password, legal identity, PayTR merchant oid, consent documents, mail routing,
timing rules, ...). Mobile vendors a copy (`tarodan-mobile/src/types`). Repo
rules: [root CLAUDE.md](../../CLAUDE.md).

## Rules

- **One source.** A rule or shape that two surfaces must agree on lives here,
  never re-typed in an app. The API also imports this package at **runtime**
  (validators, oid builders), which is why runtime helpers live here and not in
  `@tarodan/shared` (the API Dockerfile builds and copies `@tarodan/types` only).
- Keep it dependency-free and framework-free: plain TypeScript types, constants
  and pure functions.
- Build output is `dist/` (`tsup`, cjs + esm). After a change, run
  `pnpm --filter @tarodan/types build` before typechecking consumers.
- **A change here is a contract change.** If mobile can see it (endpoint,
  field, enum value, error key, validation rule, pagination, push payload,
  setting), the same change adds a dated delta in tarodan-ops:
  `contracts/deltas/YYYY-MM-DD-<topic>.md` (`contract-delta` skill; template in
  tarodan-ops: `contracts/README.md`).
- **Backward compatible by default.** New fields are optional; old fields stay
  until no supported mobile version reads them. A break needs a compat plan in
  tarodan-ops: `compat.md` (ship mobile, raise `min_supported_app_version_*`,
  then deploy).
- Enum or status additions also update the shared status configs
  (`@tarodan/shared`) and the i18n labels.

## Verification

```bash
pnpm --filter @tarodan/types typecheck
pnpm --filter @tarodan/types build
pnpm --filter @tarodan/api typecheck
pnpm --filter @tarodan/web typecheck
pnpm --filter @tarodan/admin typecheck
```
