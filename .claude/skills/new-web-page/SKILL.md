---
name: new-web-page
description: Add a route or page to apps/web (Next.js App Router) with the right rendering class, metadata, data layer, folder shape, i18n and tests. Use for any new storefront page or a major page restructure.
argument-hint: "<route path> <purpose>"
---

# New web page

Page: $ARGUMENTS

Read `apps/web/CLAUDE.md` and the root `CLAUDE.md` "Frontend" section first.

## 1. Pick the rendering class

| Class                 | Examples                                 | Shape                                                                                         |
| --------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| Static / content      | about, faq, terms                        | Server Component, SSG, static `metadata`                                                      |
| Public data / SEO     | product, category, brand, seller, search | Server Component fetching on the server, `generateMetadata`, Client islands, query-cache seed |
| Private / interactive | cart, orders, profile                    | thin Server shell with `robots: { index: false }` + client hooks                              |

Say which class and why before writing code.

## 2. Folder shape

```
apps/web/src/app/[locale]/(group)/<route>/
  page.tsx       # thin; Server Component unless the class says otherwise
  _lib/          # params.ts (shared server/client parser), schemas.ts, data.ts
  _hooks/        # useXxx queries, useDoXxx mutations
  _components/   # Client islands ('use client' at the leaf)
  _sections/  _modals/
```

Copy the closest existing route (`listings/page.tsx` for SEO + prefetch,
`profile/_modals/AddressFormModal.tsx` for forms).

## 3. Data

- Server: fetch in the page or `_lib/data.ts`; seed with
  `getServerQueryClient().prefetchQuery({ queryKey: queryKeys.<...>, ... })` +
  `HydrationBoundary`. Server and client keys must be identical: same key
  factory, same `_lib/params.ts` parser.
- Client: `useWebList` / `useWebItem` / `useWebMutation` with `webKeys`; never
  `useState` + `useEffect` + API. API calls only through `lib/api/<domain>.ts`.
- Filters and sort live in the URL.

## 4. UI

- Components from `@tarodan/ui` and `src/components/ui/`; lists are
  `ProductCard` grids with `SkeletonCard` loading and `EmptyState` empties.
- Semantic token classes only; no `dark:`.
- Every string from the catalog (`useTranslations()` / `getTranslations()`);
  add keys with the `add-i18n-key` skill.
- Metadata via `lib/seo.ts` (`localizedCanonical`, `localizedPath`).

## 5. Verify

```bash
pnpm --filter @tarodan/web typecheck
pnpm --filter @tarodan/web lint
pnpm --filter @tarodan/web exec vitest run <touched tests>
pnpm --filter @tarodan/web build     # routing or rendering changes only
```

Pure logic (parsers, formatters) gets a colocated `*.test.ts`. For SEO pages
check the content is in the server HTML; for private pages check `noindex`.
Mobile parity: if the page is user-facing, check tarodan-ops:
`parity/matrix.md` and note the mobile counterpart.
