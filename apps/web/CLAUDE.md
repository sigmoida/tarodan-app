# Web — UI & Frontend Principles

Guidance for building UI in `apps/web` — the **public marketplace**. Read this
before adding routes, components, or hooks. These rules are enforced partly by
ESLint (`@tarodan/eslint-config/next`) and partly by review.

The bar is a codebase a new contributor can extend without reading all of it:
one canonical way to do each recurring thing, one source of truth per fact, and
patterns that hold at 500 routes as well as at 50. Concretely that means a new
screen should be assembled from the primitives and recipes below — if you find
yourself inventing a fourth way to fetch a list or a second way to frame a
dialog, stop and reuse (or extend) the existing one.

The design-system and component rules here are **identical to `apps/admin`** —
same `@tarodan/ui` components, same design tokens, same "thin components, logic
in hooks", same DRY discipline. The **one difference** is rendering: admin is a
private dashboard where every page is a Client Component; web is public, so
SEO, first paint, and shareability matter — and rendering is decided **per
route** (§4).

## 1. Base components come from `@tarodan/ui`

Never rebuild a primitive that already exists in `@tarodan/ui` (Button, Input,
Select, Textarea, Checkbox, Radio, Label, FormField, Card, Badge, Spinner,
Modal, …). Import from `@tarodan/ui`.

- Raw `<button>`, `<input>`, `<select>`, `<textarea>` are **ESLint errors** —
  use the component. (`<input type="file">` is the only raw-input exception.)
- Need a variant/state that doesn't exist? Add it to `@tarodan/ui` (shared with
  admin + mobile), don't fork a local copy.
- **Marketplace composites** built _from_ `@tarodan/ui` (e.g. `ProductCard`,
  `BrandCard`, `ScaleChip`, `SectionHeader`) live in `src/components/ui/`. These
  are domain widgets, not primitives — that's the correct place for them.
- Feature composites live under `src/components/<feature>/` (e.g.
  `components/auth/`, `components/home/`), not scattered at the components root.
- `src/components/ui/index.ts` re-exports the `@tarodan/ui` surface the app
  actually uses next to the web-specific widgets, so a screen imports from one
  place. Add new shared exports there rather than importing deep paths per file.

## 2. Everything flows from design tokens

Colors, spacing, radius, and typography come from `@tarodan/design-tokens` (via
the shared Tailwind preset). In markup use **semantic token classes only**:
`primary`, `danger`, `success`, `info`, `warning`, `surface`, `surface-alt`,
`surface-elevated`, `heading`, `body`, `muted`, `subtle`, `border`, `inverted`.

- Raw Tailwind palette (`bg-gray-100`, `text-red-500`, …) and raw `white`/`black`
  utilities are **ESLint errors**.
- No hardcoded hex / rgba in components.
- Don't re-pass a component's built-in defaults — ESLint flags redundant classes.
- The storefront is **light-only**. Never add `dark:` variants or a theme toggle.

## 3. User-facing copy is translated, never hardcoded

Every string a user reads comes from the catalog in `@tarodan/i18n`, rendered
through `useTranslations()` / `t()` (server: `getTranslations()`). Literal
Turkish is caught by the `@tarodan/no-hardcoded-turkish` ESLint rule — a
**warning** here (admin runs it as an error) only because the storefront still
carries a backlog. Treat it as an error in code you touch: don't add new ones,
and clear the ones in the file you're already editing.

- Add the key to the catalog first, then use it — a key used in two places must
  not exist twice under different names.
- Formatting (dates, money, numbers) goes through the shared helpers
  (`lib/format.ts`, `@tarodan/i18n`), never per-component `toLocaleString` calls
  with inline options.
- Copy that a page can't own (validation messages, modal buttons) is passed in
  from the caller that has the `t()` — see `useFormModalLabels` (§10).

## 4. Rendering strategy is decided per route (the web-specific rule)

**Default to a Server Component.** Reach for `'use client'` only at the smallest
interactive island — never at the page root by reflex. Today most pages are
client (80 of 104); the refactor pushes that boundary down.

Every route falls into one of three classes — decide which before you build:

1. **Static / content** — `about`, `faq`, `terms`, `privacy`, `guides`,
   `size-guide`, `sayfa/[slug]`, … No per-request data. Pure Server Components,
   statically rendered (SSG); `generateStaticParams` for dynamic content slugs.

2. **Public data / SEO** — `/` (home), `products/[id]`, `category/[slug]`,
   `brands/[slug]`, `seller/…`, `listings/[id]`, `collections/[id]`, `search`.
   **Server Component that fetches on the server** so the content ships in the
   initial HTML for crawlers, and **exports `generateMetadata`** (title,
   description, Open Graph). Interactive bits (add-to-cart, favorite, image
   gallery, filters) are **Client islands nested inside** the server page. Use
   Next's `fetch` caching (`revalidate`, `revalidateTag`) where data allows.

3. **Private / interactive** — `cart`, `checkout`, `messages`, `notifications`,
   `offers`, `orders`, `favorites`, `wishlist`, `profile/*`, `settings`. App-like
   flows behind auth, non-indexable. Client-rendered with TanStack Query + hooks
   (same recipe as admin, §8). Keep a thin **Server Component shell** for the
   layout + metadata `robots: { index: false }`.

**Auth-aware SSR.** Auth is server-owned: `lib/server/session.ts` (built on
`@tarodan/auth`) reads the httpOnly `web_at` / `web_rt` cookies and the client
talks to the API through the `/gateway` proxy — the token is never in JS. A
Server Component gets the user with `getSession()`; authenticated server fetches
go through that module's `apiFetch`. **Never read `authStore` (client zustand)
on the server** — it doesn't exist there; the server's source of truth is the
cookie.

**Client boundaries push to leaves.** A Server page can render Client children; a
Client component cannot render Server children. Don't make a whole page client
for one button — extract the button into a Client island. Watch the barrel
problem: importing a client-only component into a Server chain drags it (and its
`useState`) across the boundary — import from a subpath if needed (see admin's
`@tarodan/ui/logo`).

**Metadata is per route.** Every indexable route exports `generateMetadata`
(dynamic) or a static `metadata` (title `"<Page> · Tarodan"`, description, OG),
with canonical/alternates built from `lib/seo.ts` (`localizedCanonical`,
`localizedPath`) — never a hand-written URL string. Private routes set
`robots: { index: false }`. Indexing itself is one env-gated switch
(`ALLOW_INDEXING`); don't add a second place that decides it.

## 5. Thin components, logic in hooks

A component should mostly render. Put data-fetching, form submission, and side
effects in a hook (`src/hooks/`, or the route's `_hooks/`). Logic that is (or
will be) shared across apps → a **package**, not here.

- Use React context only when state is genuinely shared across a subtree. Global
  client state already lives in zustand stores (`authStore`, `cartStore`) — don't
  wrap it in another context "just because".
- A page component that exceeds ~150 lines is a smell: split sections into
  `_sections/`, dialogs into `_modals/`, and the orchestration into a `_hooks/`
  hook that returns the data + handlers the page renders.

## 6. DRY — never duplicate

If you're about to copy a block, extract it (component, hook, or constant).

- Render shared elements **once** outside conditionals rather than in each branch.
- Duplicated config/data (status maps, option lists, labels) is the most
  dangerous kind — it drifts silently. Keep one source of truth; prefer shared
  `@tarodan/types` / `@tarodan/ui` over local copies.
- Before writing a helper, check `@tarodan/ui`, `@tarodan/types`, `src/lib/`, and
  `src/hooks/` for an existing one.
- Rules that both the server and the client must agree on (URL filter parsing,
  price/discount math, phone normalization) live in **one** module that both
  import — a second implementation is a bug waiting for a mismatch, not a
  duplication of style.

## 7. Small component APIs

Many props = a design smell. Prefer composition (`children`, slots) over
configuration (flags). If a component needs a long prop list, split it or lift
composition to the caller.

## 8. Data & fetching — two modes, one discipline

Web mixes server and client data. Never `useState` + `useEffect` + `api` by hand.

### Server-fetched data (route classes 1 & 2)

Fetch in the Server Component itself (or a colocated `_lib/data.ts` helper),
forwarding cookies for authed calls, and either pass results down as props or
**seed the query cache**:

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

The seed only works if the **server key and the client key are identical** —
that is the whole reason `lib/query/keys.ts` exists. Never hand-write a key
array at a call site, and when a key depends on parsed input (filters, page,
slug→id resolution), both sides must run the **same parser** from the route's
`_lib/params.ts`. A key that differs by one normalized empty string costs a
refetch flash on every first paint. `listings/page.tsx` is the canonical example.

### Client data & mutations (route class 3 + islands)

- **Lists** → `useWebList({ resource, fetcher, params })`
- **Single item** → `useWebItem({ resource, id, fetcher })`
- **Writes** → `useWebMutation(fn, { invalidates: ['resource'], successMessage })`

These are the web analogues of admin's `useAdminResource` / `useAdminItem` /
`useAdminMutation` (`src/hooks/useWebResource.ts`, `useWebMutation.ts`). The
mutation hook owns the success/error toast and `invalidateQueries`, so lists
refresh themselves — **no manual `refetch()`**, and no re-implementing
`err?.response?.data?.message` (use the exported `apiErrorMessage`). Keys come
from `webKeys` (resource-prefixed) so `invalidates: ['addresses']` hits every
list and detail of that resource at once.

Use the same `resource` string for a list and its detail, and pass localized
copy in from the caller — the hooks are deliberately i18n-agnostic.

SSR-prefetched public grids keep their bespoke `queryKeys`-keyed hooks so their
keys match the server seed; `useWebList` is for the account-area lists.

### The API layer

The API layer is **`lib/api/*`, split by domain** (products, catalog, collections,
orders, payments, membership, messages, auth, user, cart, …), each module exporting
a `xxxApi` object behind a thin `client` (axios, `withCredentials`, refresh
interceptor) and re-exported from `lib/api/index.ts` — exactly like admin's
`lib/api/`. It must stay **isomorphic** (runs on server and client): the axios
instance is fine client-side; server fetches use a small helper that forwards
cookies. A collision guard (`pnpm --filter @tarodan/web test:api`, run in CI's Lint
job) keeps every export name unique across the modules, as in admin.

Response envelopes vary (`[]`, `{ data }`, `{ products }`) — collapse them with
`unwrapList` from `lib/unwrapList.ts` instead of re-writing the `Array.isArray`
dance in each hook.

## 9. Lists & collections — cards, not tables

Web is a storefront: its lists are **card grids and rails**, not data tables
(the `col.*` column factory is an admin concept and has no place here). Assemble
them from the shared pieces so every grid in the app behaves the same:

- **Item** → `ProductCard` (or the feature's card in `components/<feature>/`).
- **Loading** → `SkeletonCard`, matching the card's footprint — never a bare
  spinner in a grid, it collapses the layout and shifts content on arrival.
- **Empty** → `EmptyStateCard` / `EmptyState`, always with the action that
  resolves the emptiness (browse, clear filters).
- **Paging** → `Pagination` from `@tarodan/ui`, or an infinite rail via
  `useInfiniteQuery`. Pick one per surface and stay with it.
- **Grouping/heading** → `SectionCard`, `MetricCard` for account-area summaries.

**Filter and sort state lives in the URL**, not in `useState` — it has to be
shareable, back-button-correct, and readable by the server for the prefetch.
Parse it with the route's shared `_lib/params.ts` helpers (see §8) so a filter
means exactly one thing on both sides.

## 10. Forms & CRUD — the modal + RHF/zod recipe

Create/edit is a **self-contained modal component** per resource, living in the
route's `_modals/`. The page owns only `open`/`close` state. Destructive actions
go through the shared **`useConfirm`** provider (`components/ConfirmProvider`)
plus a `useWebMutation` — no bespoke "are you sure" dialog.

- **`FormModal`** (`@tarodan/ui/form`) = `Modal` + RHF `Form` + Cancel/Submit
  footer + unsaved-changes guard. The resource modal owns the `form` (from
  `useZodForm`) and the mutation; `FormModal` only frames them.
- **Field wrappers** (`@tarodan/ui/form`): `FormInput`, `FormSelect`,
  `FormTextarea`, `FormCheckbox`, `FormPhone`, `FormImageUpload`. Each wires
  value + error from context by `name` — never thread `register`/`error` by hand.
  A custom-driven control (e.g. `CityDistrictSelector`) still registers its field
  and writes through `setValue(..., { shouldValidate: true })`, so validation
  stays in one place.
- **Labels** come from `useFormModalLabels()` (close/cancel/discard copy), so
  every dialog in the app says the same thing in the same language.
- **Schemas** are colocated with the route that owns them — `_lib/schemas.ts`,
  with `z.infer` types exported. Cross-feature rules (phone, email) come from the
  shared builders (`trPhone`, `trPhoneOptional` in `@tarodan/ui/form`) — do not
  re-write a regex locally. Keep zod **validation-only**; shape values
  (string→number, `"" → undefined`) in the `mutationFn`.

```tsx
const form = useZodForm(addressSchema, { defaultValues: EMPTY });
const save = useSaveAddress();                       // wraps useWebMutation
return (
  <FormModal open={open} onClose={onClose} title={…} form={form}
    onSubmit={(v) => save.mutate({ id: address?.id ?? null, values: v },
                                 { onSuccess: onClose })}
    isSubmitting={save.isPending} resetValues={address ?? EMPTY} {...useFormModalLabels()}>
    <FormInput name="fullName" label={t('address.fullName')} />
    <FormPhone name="phone" label={t('address.phone')} />
  </FormModal>
);
```

`profile/_modals/AddressFormModal.tsx` is the canonical example. Guest flows
(checkout without an account) reuse the **same** schema and fields — a second,
"simpler" copy of a form is how the two versions drift apart.

## 11. State (zustand) is client-only

`authStore`, `cartStore`, `recentSearchesStore` are **client** state (they read
`localStorage` / cookies). Never import a store into a Server Component. Server
code derives auth from the request cookie, not the store.

Server data does not belong in a store: if it comes from the API, it belongs in
TanStack Query (§8), which already owns caching, invalidation and staleness.

## 12. Layouts & routing (App Router)

Separate concerns with **route groups**, each with its own `layout.tsx`:

- Public marketplace shell (header/nav/footer) — the storefront chrome.
- Auth pages (`login`, `register`, `forgot-password`, …) — minimal frame, no
  storefront chrome, "already logged in?" redirect in the layout.
- Account/private area (`profile/*`, `settings`, `orders`, `messages`) — app
  chrome + client providers (query / toast), metadata `noindex`.

One screen = one concern. A page that swaps between two distinct flows via a mode
flag should be **two routes**.

### Folder shape per route (mirror admin)

```
app/<route>/
  page.tsx                 # Server Component by default; thin
  _lib/…                   # types, schemas, params parsers, server data fetchers
  _hooks/…                 # route-local queries/mutations & form orchestration
  _components/…            # route-local composites & Client islands
  _sections/…              # larger page sections
  _modals/…                # dialogs (own form + mutation)
  [id]/ | [slug]/          # dynamic segments: fetch + generateMetadata
```

Everything under `_*` is private to the route. The moment a second route needs
it, it moves up (`src/components/<feature>/`, `src/hooks/`, `src/lib/`) — copying
it across two `_lib/` folders is the failure mode this shape exists to prevent.

## 13. Shared config is upstream — don't fork it

`tsconfig`, Tailwind, and ESLint extend shared packages
(`@tarodan/tsconfig/nextjs`, `@tarodan/design-tokens/tailwind`,
`@tarodan/eslint-config/next`). App config files only hold app-specific bits.
Change a shared rule in the package, not by overriding here.

## 14. Verification

Run these before calling a change done — all from the repo root:

```bash
pnpm --filter @tarodan/web typecheck     # next typegen && tsc --noEmit
pnpm --filter @tarodan/web lint          # no raw primitives, no raw palette
pnpm --filter @tarodan/web test          # vitest + node --test on scripts/
pnpm --filter @tarodan/web test:api      # api export-name collision guard
pnpm --filter @tarodan/web build         # before shipping anything routing-related
```

Touching `@tarodan/ui` (or any package) means verifying the **consumers** too —
`pnpm --filter @tarodan/admin typecheck` at minimum; a shared component is not
"done" when only one app compiles.

Pure logic (parsers, formatters, price/phone/coupon math) gets a colocated
`*.test.ts` — these are the units that silently break flows nobody notices until
checkout. UI plumbing does not need a test for its own sake.

For SEO/data routes: confirm content is in the **server HTML** (view source),
`generateMetadata` resolves title/description, and interactive islands still
hydrate. For private routes: confirm `robots: noindex` and that authed server
fetches forward the cookie.
