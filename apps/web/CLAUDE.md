# Web — UI & Frontend Principles

Guidance for building UI in `apps/web` — the **public marketplace**. Read this
before adding routes, components, or hooks. These rules are enforced partly by
ESLint (`@tarodan/eslint-config/next`) and partly by review.

The design-system and component rules here are **identical to `apps/admin`** —
same `@tarodan/ui` components, same design tokens, same "thin components, logic
in hooks", same DRY discipline. The **one difference** is rendering: admin is a
private dashboard where every page is a Client Component; web is public, so
SEO, first paint, and shareability matter — and rendering is decided **per
route** (§3). When a rule below isn't web-specific, it means "same as admin".

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

## 2. Everything flows from design tokens

Colors, spacing, radius, and typography come from `@tarodan/design-tokens` (via
the shared Tailwind preset). In markup use **semantic token classes only**:
`primary`, `danger`, `success`, `info`, `warning`, `surface`, `surface-alt`,
`surface-elevated`, `heading`, `body`, `muted`, `subtle`, `border`, `inverted`.

- Raw Tailwind palette (`bg-gray-100`, `text-red-500`, …) and raw `white`/`black`
  utilities are **ESLint errors**.
- No hardcoded hex / rgba in components.
- Don't re-pass a component's built-in defaults — ESLint flags redundant classes.

## 3. Rendering strategy is decided per route (the web-specific rule)

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
   (same recipe as admin, §7). Keep a thin **Server Component shell** for the
   layout + metadata `robots: { index: false }`.

**Auth-aware SSR.** Auth lives in **httpOnly cookies** (`withCredentials: true`);
the token is never in JS. A Server Component can fetch authenticated data by
forwarding the incoming request cookies to the API (`cookies()` → `Cookie`
header). **Never read `authStore` (client zustand) on the server** — it doesn't
exist there; the server's source of truth is the cookie.

**Client boundaries push to leaves.** A Server page can render Client children; a
Client component cannot render Server children. Don't make a whole page client
for one button — extract the button into a Client island. Watch the barrel
problem: importing a client-only component into a Server chain drags it (and its
`useState`) across the boundary — import from a subpath if needed (see admin's
`@tarodan/ui/logo`).

**Metadata is per route.** Every indexable route exports `generateMetadata`
(dynamic) or a static `metadata` (title `"<Page> · Tarodan"`, description, OG).
Private routes set `robots: { index: false }`. Unlike admin (client
`document.title` sync), web sets titles the idiomatic Next way — in metadata — so
they're in the SSR HTML.

## 4. Thin components, logic in hooks

A component should mostly render. Put data-fetching, form submission, and side
effects in a hook (`src/hooks/`). Logic that is (or will be) shared across apps →
a **package**, not here.

- Use React context only when state is genuinely shared across a subtree. Global
  client state already lives in zustand stores (`authStore`, `cartStore`) — don't
  wrap it in another context "just because".

## 5. DRY — never duplicate

If you're about to copy a block, extract it (component, hook, or constant).

- Render shared elements **once** outside conditionals rather than in each branch.
- Duplicated config/data (status maps, option lists, labels) is the most
  dangerous kind — it drifts silently. Keep one source of truth; prefer shared
  `@tarodan/types` / `@tarodan/ui` over local copies.
- Before writing a helper, check `@tarodan/ui`, `@tarodan/types`, `src/lib/`, and
  `src/hooks/` for an existing one.

## 6. Small component APIs

Many props = a design smell. Prefer composition (`children`, slots) over
configuration (flags). If a component needs a long prop list, split it or lift
composition to the caller.

## 7. Data & fetching — two modes, one discipline

Web mixes server and client data. Never `useState` + `useEffect` + `api` by hand.

### Server-fetched data (route classes 1 & 2)
Fetch in the Server Component itself (or a colocated server helper), forwarding
cookies for authed calls, and pass results down as props. Use Next `fetch`
caching (`revalidate` / tags) for public, cacheable data. This is what puts
content in the crawlable HTML.

### Client data & mutations (route class 3 + islands)
TanStack Query (`lib/queryClient.ts`) + hooks in `src/hooks/`. Mirror the admin
ergonomics as we refactor:
- **Lists** → a query hook (pagination / debounced search / filters / URL sync),
  the web analogue of admin's `useAdminResource`.
- **Writes** → a mutation hook that owns the toast + `invalidateQueries`, the web
  analogue of admin's `useAdminMutation` — the **only** way to mutate, so lists
  refresh automatically (no manual `refetch()`).
- Every dialog/modal is its **own** component owning its form + zod validation +
  mutation (built on the shared `Modal` + RHF `@tarodan/ui/form`). The page holds
  only open/close state.

### The API layer
`lib/api.ts` (793 lines) is split into **`lib/api/*` by domain** (products,
catalog, listings, orders, checkout, membership, messaging, auth, user, …) behind
a thin `client` (axios, `withCredentials`, refresh interceptor) — exactly like
admin's `lib/api/`. It must stay **isomorphic** (runs on server and client): the
axios instance is fine client-side; server fetches use a small helper that
forwards cookies. A collision guard (`pnpm test:api`) keeps the merged surface
unique, as in admin.

## 8. State (zustand) is client-only

`authStore`, `cartStore`, `recentSearchesStore` are **client** state (they read
`localStorage` / cookies). Never import a store into a Server Component. Server
code derives auth from the request cookie, not the store.

## 9. Layouts & routing (App Router)

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
  _lib/…                   # types, schema, static option lists, columns
  _components/…            # route-local composites & Client islands
  _sections/…              # larger page sections
  _modals/…                # dialogs (own form + mutation)
  [id]/ | [slug]/          # dynamic segments: fetch + generateMetadata
```

## 10. Shared config is upstream — don't fork it

`tsconfig`, Tailwind, and ESLint extend shared packages
(`@tarodan/tsconfig/nextjs`, `@tarodan/design-tokens/tailwind`,
`@tarodan/eslint-config/next`). App config files only hold app-specific bits.
Change a shared rule in the package, not by overriding here.

## 11. Verification

- `pnpm --filter @tarodan/web typecheck` + `build` green after each change.
- `pnpm --filter @tarodan/web lint` clean — no raw `button/input/select/textarea`,
  no raw palette, semantic tokens only.
- For SEO/data routes: confirm content is in the **server HTML** (view source),
  `generateMetadata` resolves title/description, and interactive islands still
  hydrate. For private routes: confirm `robots: noindex` and that authed server
  fetches forward the cookie.
</content>
