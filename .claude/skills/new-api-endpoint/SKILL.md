---
name: new-api-endpoint
description: Add or change a NestJS endpoint in apps/api the canonical way (module placement, DTO, thin controller, service, authz, throttle, i18n errors, tests, contract delta). Use for any new route or change to a route's request, response or access rules.
argument-hint: "<METHOD /path> <what it does>"
---

# New API endpoint

Task: $ARGUMENTS

Read first: `apps/api/CLAUDE.md`; for money paths `.claude/rules/money.md`; for
auth paths `apps/api/src/modules/auth/CLAUDE.md`. Money, stock, schema, authZ and
concurrency work is senior (Opus) work.

## Steps

1. **Find the owning module** in `apps/api/src/modules/<domain>/`. Never read
   another domain's tables: inject its service or add a method there. Search for
   an existing helper before writing one (`git grep -n "<concept>" apps/api/src`).
2. **DTO** in `<module>/dto/`: class-validator decorators for every field
   (`whitelist` drops the rest). Reuse shared validators (`@IsTrPhone`,
   `@IsPassword`, TR IBAN in `src/common/validators`). A shape that web, admin
   or mobile also use goes into `packages/types`.
3. **Service method** holds the logic. More than one row written for one event
   -> `$transaction`; no HTTP, mail or queue publish inside it (outbox instead).
   Lists use `src/common/list` (`paginate`, `resolveOrderBy`). Select only
   what you return. Ownership checks ("is this yours?") live here.
4. **Controller method** stays thin: decorators + DTO + one service call.
   - Access: default closed. `@Public()` only on purpose; admin routes use
     `@AdminRoute()` with the admin guard and a `PERMISSION_MAP` entry (or
     `@RequirePermission`), or `permission-map-coverage.spec.ts` fails.
   - `@Throttle` on auth, OTP, contact and abuse-prone routes; add sensitive
     ones to `guards/critical-route-throttles.spec.ts`.
   - `@ApiOperation` + `@ApiResponse`. `@CurrentUser()` for the caller.
5. **Errors:** honest Nest exceptions with catalog keys:
   `throw new NotFoundException(i18nMessage("server.<area>.<key>", { id }))`.
   Add the key to `tr.json` and `en.json` (`add-i18n-key` skill).
6. **Tests:** colocated `*.spec.ts` for the service logic and an authZ case;
   money, state transitions and authorization never ship untested. Bug fix =
   red test first. Run: `cd apps/api && npx jest <paths> --maxWorkers=2`.
7. **Contract:** if mobile can see the change, add a dated delta in
   tarodan-ops: `contracts/deltas/YYYY-MM-DD-<topic>.md` and keep it backward
   compatible (new fields optional). Mention it in the commit body.
8. **Verify:** `pnpm --filter @tarodan/api typecheck`, `pnpm --filter @tarodan/api lint`.
   If `packages/types` changed: `pnpm --filter @tarodan/types build`, then
   typecheck web and admin. Run `pnpm docs:mobile-api` when a mobile-facing
   route changed.
9. Commit with the `commit` skill (`feat(api): ...`).

## Checklist (Definition of Done, API endpoint)

- [ ] DTOs validated; shared types in `packages/types`
- [ ] AuthZ explicit and tested; rate limit considered
- [ ] Errors are i18n keys in tr + en
- [ ] No N+1 on lists; paginated through `common/list`
- [ ] Contract delta written or "not visible to mobile" stated
