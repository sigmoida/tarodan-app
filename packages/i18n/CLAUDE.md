# @tarodan/i18n (packages/i18n)

The single tr/en message catalog for web, admin, API and mobile, plus the
locale contract and the generated `MessageKey` union. Full guide (exports,
namespaces, consumer setup, adding a language): [README.md](README.md). Repo
rules: [root CLAUDE.md](../../CLAUDE.md).

## Digest

- Catalog: `src/catalog/tr.json` and `en.json`, one namespaced ICU tree. **Both
  files always have the same keys** (Turkish is the source, English a real
  translation). Namespaces: `common.*`, storefront domains, `admin.*`,
  `server.*` / `email.*` (API), `mobile.*`.
- Reuse before adding: search `common.*` first. A string used on two screens
  must not exist twice under two names.
- After a catalog edit run `pnpm --filter @tarodan/i18n codegen` (the Claude
  Code hook does it automatically) and, before typechecking web or admin,
  `pnpm --filter @tarodan/i18n build`.
- `src/generated/keys.ts` is generated: never edit it by hand (a hook refuses).
- `pnpm --filter @tarodan/i18n typecheck` runs `scripts/check-catalog.mjs`: key
  parity and a fresh `keys.ts`. It checks keys, not values: about 1,170 long
  legal and content texts still carry the Turkish text in `en.json` on purpose
  until legal review.
- Supported locales come only from `locales` in `src/locale.ts`; import the
  `Locale` type, never redeclare `'tr' | 'en'`.
- API: exceptions use `i18nMessage('server....')`; e-mail and push render in
  the recipient's `User.preferredLanguage`.
- Lint: `@tarodan/no-hardcoded-turkish` (error in web and admin) catches
  literals with Turkish characters only; justified exceptions use a line
  disable with a reason.
- Mobile uses the same key names and values as web; new user-facing keys are
  relevant to the mobile catalog too.

Use the `add-i18n-key` skill for the full flow.
