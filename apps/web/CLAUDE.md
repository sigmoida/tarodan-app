# Web (apps/web)

The public storefront. The shared frontend rules (thin pages, `@tarodan/ui`,
tokens, React Query, RHF + zod, i18n, light theme, TR phone) are in the
[root CLAUDE.md](../../CLAUDE.md), "Frontend". This file holds what is
web-specific: rendering is decided **per route**, lists are cards, and SEO,
first paint and shareability matter.

## Rendering strategy per route

**Default to a Server Component.** Add `'use client'` only at the smallest
interactive island, never at the page root by reflex. Decide the route class
before you build:

1. **Static / content** (`about`, `faq`, `terms`, `privacy`, `guides`,
   `sayfa/[slug]`, ...): no per-request data; pure Server Components, statically
   rendered; `generateStaticParams` for dynamic content slugs.
2. **Public data / SEO** (`/`, `products/[id]`, `category/[slug]`,
   `brands/[slug]`, `seller/...`, `listings/[id]`, `collections/[id]`,
   `search`): a Server Component that fetches on the server so content is in
   the initial HTML, exports `generateMetadata`, and nests Client islands
   (cart, favourite, gallery, filters). Use Next `fetch` caching
   (`revalidate`, `revalidateTag`) where the data allows.
3. **Private / interactive** (`cart`, `checkout`, `messages`, `notifications`,
   `offers`, `orders`, `favorites`, `profile/*`, `settings`): client-rendered
   with TanStack Query and hooks, inside a thin Server shell with
   `robots: { index: false }`.

### Auth-aware SSR

Auth is server-owned: `lib/server/session.ts` (on `@tarodan/auth`) reads the
httpOnly `web_at` / `web_rt` cookies, and the browser talks to the API through
the `/gateway` proxy, so the token never reaches JS. Server Components get the
user from that module and fetch through its `apiFetch`. **Never read a client
store (`authStore`) on the server.**

### Client boundaries

A Server page can render Client children; a Client component cannot render
Server children. Extract the one interactive button instead of making the page
client. Beware barrels: importing a client-only component into a Server chain
drags it across the boundary; import from a subpath (`@tarodan/ui/utils`,
`@tarodan/ui/logo`, ...).

### Metadata

Every indexable route exports `generateMetadata` or a static `metadata` (title
`"<Page> · Tarodan"`, description, Open Graph), with canonical and alternates
from `lib/seo.ts` (`localizedCanonical`, `localizedPath`), never a hand-written
URL. Private routes set `robots: { index: false }`. Indexing has one env switch
(`ALLOW_INDEXING`); do not add a second.

## Data

### Server-fetched data (classes 1 and 2)

Fetch in the Server Component (or `_lib/data.ts`), forwarding cookies for
authed calls, then pass props or seed the query cache:

```tsx
const queryClient = getServerQueryClient(); // lib/query/server.ts
await queryClient.prefetchQuery({
  queryKey: queryKeys.listings.list(filters, categoryId, page),
  queryFn: () => fetchListingsServer(params),
});
return (
  <HydrationBoundary state={dehydrate(queryClient)}>
    <ListingsClient />
  </HydrationBoundary>
);
```

The seed works only if the **server and client keys are identical**: keys come
from `lib/query/keys.ts`, and inputs (filters, page, slug -> id) go through the
same parser in the route's `_lib/params.ts` on both sides. `listings/page.tsx`
is the canonical example.

### Client data and mutations (class 3 and islands)

- Lists: `useWebList({ resource, fetcher, params })`; one item:
  `useWebItem({ resource, id, fetcher })` (`hooks/useWebResource.ts`).
- Writes: `useWebMutation(fn, { invalidates: ['resource'], successMessage })`;
  it owns the toast and invalidation. Errors use the exported `apiErrorMessage`.
- Keys come from `webKeys`; use the same `resource` string for a list and its
  detail. Pass localized copy in from the caller (the hooks are i18n-agnostic).
- SSR-prefetched public grids keep their `queryKeys`-keyed hooks so keys match
  the server seed; `useWebList` is for account-area lists.

### API layer

`lib/api/*` is split by domain, each module exporting an `xxxApi` object behind
a thin axios `client` (credentials, refresh interceptor), re-exported from
`lib/api/index.ts`. It stays isomorphic; server fetches forward cookies.
`pnpm --filter @tarodan/web test:api` keeps export names unique. Collapse
response envelopes with `lib/unwrapList.ts`.

## Lists are cards, not tables

- Items are `ProductCard` (or the feature card in `components/<feature>/`);
  the `col.*` table factory is admin-only.
- Favourite = the card's built-in heart (`ProductCardFavorite`), state from
  `hooks/useWishlist` over the one `GET /wishlist` query. Never add a second
  favourite query; pass `showFavorite={false}` where the card has its own control.
- Card action = the card's built-in price-row button (`ProductCardPriceRow`):
  the cart toggle, or "Öne Çıkar" / "Süre Ekle" on the viewer's own listing,
  always from `productCardAction` (`@tarodan/types`). The title is the card's
  one stretched link, so buttons sit beside it, never inside an `<a>`. Do not
  add a second card button; a card with its own control passes `footer`.
- Loading = `SkeletonCard` matching the card footprint (never a bare spinner in
  a grid); empty = `EmptyStateCard` / `EmptyState` with the action that resolves
  it; paging = `Pagination` or an infinite rail, one per surface. Pickers inside
  forms, modals and editors use a "Show more" button (`common.loadMore`)
  instead: page numbers would split the user's picks and an infinite rail would
  push the submit out of reach (`hooks/useWebInfiniteList`, `lib/pagedList.ts`,
  `hooks/usePagedPicks.ts`; the trade pickers).
- **Filter and sort state lives in the URL**, parsed by the route's
  `_lib/params.ts`, so it is shareable and readable by the server prefetch.

## Components and forms

- Marketplace composites built from `@tarodan/ui` (`ProductCard`, `BrandCard`,
  `SectionHeader`, ...) live in `src/components/ui/`, which also re-exports the
  `@tarodan/ui` surface the app uses. Feature composites go in
  `src/components/<feature>/`.
- Create/edit is a self-contained modal in the route's `_modals/` using
  `FormModal` and `useFormModalLabels()`; the page holds only open/close
  state. `profile/_modals/AddressFormModal.tsx` is the canonical example.
  Guest flows reuse the same schema and fields.
- Client stores (`authStore`, `cartStore`, `recentSearchesStore`) never enter a
  Server Component and never hold server data.

## Layout and folders

Route groups separate the storefront shell, the auth pages (minimal frame;
login and register redirect a signed-in visitor at the edge, the mail-link
pages do not) and the private area (providers, `noindex`). A
page that swaps two flows by a mode flag becomes two routes.

```
app/<route>/
  page.tsx        # Server Component by default; thin
  _lib/           # types, schemas, params parsers, server data fetchers
  _hooks/         # route-local queries, mutations, form orchestration
  _components/    # route-local composites and Client islands
  _sections/      # larger page sections
  _modals/        # dialogs (own form + mutation)
  [id]/ [slug]/   # dynamic segments: fetch + generateMetadata
```

## Well-known files

- `public/.well-known/` serves `apple-app-site-association` and
  `assetlinks.json` (plus `-staging` variants). The path is outside the
  middleware matcher: no locale prefix, auth or `SITE_LOCKED` gate.
- `well-known-rewrites.js` rewrites (never redirects; Android verification
  rejects redirects) the staging host to the staging files; `next.config.js`
  pins `Content-Type: application/json` for both.
- Fingerprints are generated in tarodan-mobile (`docs/wellknown/fingerprints.json`,
  `scripts/gen-wellknown.mjs`) and copied here; never hand-edit them
  (`docs/ANDROID_APP_LINKS.md`).

## Verification

```bash
pnpm --filter @tarodan/web typecheck
pnpm --filter @tarodan/web lint
pnpm --filter @tarodan/web exec vitest run <paths>
pnpm --filter @tarodan/web test:api
pnpm --filter @tarodan/web build        # only for routing/rendering changes
```

Pure logic (parsers, formatters, price, phone and coupon math) gets a colocated
`*.test.ts`. For SEO routes confirm the content is in the server HTML and
`generateMetadata` resolves; for private routes confirm `noindex` and that
authed server fetches forward the cookie. Playwright journeys live in
`e2e/journeys/` (local only today).
