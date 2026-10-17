---
name: add-i18n-key
description: Add or change user-facing copy in the shared @tarodan/i18n catalog (tr + en parity, key naming, codegen, build, catalog check) and consume it from web, admin or the API. Use whenever a string a user reads is added or changed.
argument-hint: "<key or namespace> <text>"
---

# Add an i18n key

Copy: $ARGUMENTS

Full guide: `packages/i18n/README.md`. Digest: `packages/i18n/CLAUDE.md`.

## Steps

1. **Search before adding.** Reuse an existing key, starting with `common.*`:
   `git grep -n '"<text fragment>"' packages/i18n/src/catalog/tr.json`. A string
   used on two screens must not exist twice under two names.
2. **Pick the namespace:** `common.*` (shared primitives), storefront domains
   (`product.*`, `cart.*`, ...; shared by web and mobile), `admin.<area>.*`,
   `server.<area>.*` (API exceptions and messages), `email.*`, `mobile.*`.
   Prefer the key name the web already uses for the same concept.
3. **Add the key to both catalogs** at the same path:
   `packages/i18n/src/catalog/tr.json` (Turkish source) and `en.json` (a real,
   natural English translation; long legal texts are the only exception). ICU
   format for values: `"{count} aktif ilanınız var"`, plural/select via ICU.
4. **Codegen** (the Claude Code PostToolUse hook runs it after catalog edits and
   reports tr/en parity; run it by hand otherwise):

   ```bash
   pnpm --filter @tarodan/i18n codegen      # regenerates src/generated/keys.ts
   pnpm --filter @tarodan/i18n typecheck    # parity + fresh keys.ts
   pnpm --filter @tarodan/i18n build        # before typechecking web/admin
   ```

   Never edit `src/generated/keys.ts` by hand.

5. **Consume:**
   - web/admin: `const t = useTranslations(); t("admin.users.title")` (full
     path); Server Components use `getTranslations()`. Module-level column or
     option lists take `t` as a parameter (builder pattern); zod schemas become
     `schema(t)` factories.
   - API: `throw new NotFoundException(i18nMessage("server.order.notFound", { orderNumber }))`.
   - Shared components never import the catalog: pass the copy in as props.
6. **Remove orphans** you created by replacing a key (search for the old key in
   `apps/` and `packages/`).
7. **Verify** the consumers: `pnpm --filter @tarodan/web typecheck` and/or
   `pnpm --filter @tarodan/admin typecheck`, plus lint (literal Turkish is an
   error: `@tarodan/no-hardcoded-turkish`).
8. Commit the catalog, `keys.ts` and the consumer together
   (`feat(web,i18n): ...`). If mobile shows the same text, note the key for the
   mobile catalog (same key, same value).
