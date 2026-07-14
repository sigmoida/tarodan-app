# @tarodan/i18n

The shared internationalization package — the single source of truth for locales
and the message catalog consumed by **web, admin, mobile, and api**. Replaces the
three drifting hand-rolled i18n systems.

## Exports

```ts
import {
  locales,
  defaultLocale,
  isLocale,
  resolveLocale, // locale contract
  messages,
  getMessages, // the ICU catalog
  formatMessage, // ICU render primitive (api / tests)
} from "@tarodan/i18n";
import type { Locale, Messages, MessageKey } from "@tarodan/i18n";
```

- **Catalog** — `messages.tr` / `messages.en`, one namespaced ICU MessageFormat
  tree. `tr` and `en` are kept in exact key parity (CI-enforced).
- **`MessageKey`** — a generated union of every dot-path key (e.g.
  `'product.addToCart'`). Gives compile-time autocomplete and fails the build on
  a typo'd key.
- **`formatMessage(msg, values?, locale?)`** — renders an ICU string. Used by api
  (Node) and tests; web/mobile render through their own libraries.

## Namespaces

`common.*` (shared primitives) · bare storefront domains (`auth`, `product`,
`cart`, …, shared by web + mobile) · `mobile.*` (mobile-only) ·
`refund.*` / `stockout.*` (shared) · `admin.*` (admin UI) ·
`server.*` / `email.*` (api-generated messages).

## Codegen & CI gate

`MessageKey` is generated from the catalog. After editing the catalog:

```bash
pnpm --filter @tarodan/i18n codegen
```

`typecheck` fails if (a) `tr`/`en` key sets differ, or (b) the generated union is
stale — so the catalog can never drift or ship stale types.

## Consumer type augmentation

Each app maps its i18n library's types to this catalog (in the app, not here, so
the shared package stays library-agnostic).

**web / admin — next-intl** (`global.d.ts`):

```ts
import type { Messages } from "@tarodan/i18n";
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IntlMessages extends Messages {}
}
```

**mobile — i18next** (`i18next.d.ts`):

```ts
import type { Messages } from "@tarodan/i18n";
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Messages };
  }
}
```

**api — @formatjs** — no augmentation; call `formatMessage(getMessages(locale)…)`
with a `MessageKey`.
