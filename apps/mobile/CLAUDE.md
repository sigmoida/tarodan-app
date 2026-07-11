# Mobile — UI & Architecture Principles

Guidance for building the `apps/mobile` app (Expo + expo-router) — the native
marketplace client. Read this before adding routes, screens, components, or
hooks. It is the **native mirror** of `apps/web/CLAUDE.md`: same "thin screens,
logic in hooks", same single server-state, same design-token and DRY discipline —
adapted from Next.js App Router to expo-router and from `@tarodan/ui` to
`@tarodan/ui-native`. When a rule isn't native-specific, it means "same as web".

Web → mobile mapping:

| Web (`apps/web`)                     | Mobile (`apps/mobile`)                       |
| ------------------------------------ | -------------------------------------------- |
| `@tarodan/ui`                        | `@tarodan/ui-native`                         |
| `@tarodan/ui/form` (RHF+zod)         | `@tarodan/ui-native/form` (`useZodForm`)     |
| App Router route groups + `_folders` | expo-router route groups + `_folders`        |
| Server Components / `generateMetadata` | (drops — native has no SSR/SEO)            |
| TanStack Query + `lib/api/*` by domain | **same** (`src/lib/query`, `src/lib/api/*`) |
| Tailwind semantic token classes      | `theme.*` tokens from `@tarodan/ui-native`   |

## 1. Base components come from `@tarodan/ui-native`

Never rebuild a primitive that already exists (`Input`, `Textarea`, `Checkbox`,
`Switch`, `Card`, `Badge`, `Alert`, `Modal`, `Spinner`, `Avatar`, `StatusBadge`,
`Stack`/`VStack`/`HStack`, `Divider`, `ProgressBar`, `EmptyState`, `ErrorState`).
Import from `@tarodan/ui-native`.

- Need a variant/state that doesn't exist? Add it to `@tarodan/ui-native`
  (shared), don't fork a local copy.
- Marketplace composites built _from_ primitives (`ProductCard`, `ListingRow`, …)
  live in `src/components/<feature>/`, not at the components root.

## 2. Everything flows from design tokens

Colors, spacing, radius, and typography come from the `theme` export of
`@tarodan/ui-native` (which re-exports `@tarodan/design-tokens`):

```ts
import { theme } from '@tarodan/ui-native';
const s = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, padding: theme.spacing.md,
          borderRadius: theme.radius.lg },
});
```

- **No hardcoded hex / rgba** in screens or components. Need a translucent
  overlay? Use `theme.colors.overlay.*`, not a raw `rgba(...)`.
- **`src/theme/colors.ts` (`TarodanColors`) is legacy and banned** — it is a
  hardcoded hex palette that predates design tokens. Do not import it. Migrate any
  remaining importer to `theme.colors.*`.

## 3. One screen = one concern (route groups)

Separate concerns with **route groups** (`(auth)`, `(tabs)`, …), each with its
own `_layout.tsx`. A screen that swaps between two distinct flows via a mode flag
should be **two routes**. There is no SSR/metadata story here — that web rule
drops entirely.

## 4. Thin screens, logic in hooks

A screen (`index.tsx`) should mostly **compose**: call its hooks, render its
sections and modals. Target **< ~150 lines**. Data-fetching, mutations, form
submission, and side effects live in colocated `_hooks/`. Business logic /
status maps / schemas live in `_lib/`. If a screen is 1000+ lines it is doing
too much — split it (see §9).

## 5. DRY — never duplicate

If you're about to copy a block, extract it (component, hook, or constant).
Duplicated config (status maps, filter tabs, labels) is the most dangerous kind —
it drifts silently. Keep **one source of truth** in `_lib/status.ts` (route-local)
or a shared package. Query keys have a single source: `@/lib/query` (§7).

## 6. Data & fetching — one discipline (TanStack Query)

**Never** `useState` + `useEffect` + `api` by hand, and **never** fetch inside a
zustand store. React Query is the **single server-state**.

- **Lists / reads** → a **query hook** in the route's `_hooks/`
  (`useXxx.ts` → `{ data, isLoading, ... }`). It owns the `queryKey` (from the
  central registry) and `queryFn` (calling `@/lib/api/*`).
- **Writes** → a **mutation hook** (`useDoXxx.ts`) that owns the snackbar/toast +
  `invalidateQueries`. This is the **only** way to mutate — so lists refresh
  automatically, no manual `refetch()`.
- Every dialog/modal is its **own** component in `_modals/`, owning its
  `useZodForm` + zod schema + mutation. The screen holds only open/close state.

### Query keys — central registry
All `queryKey`s come from `@/lib/query` (`qk.<domain>.detail(id)`, `qk.products.all`).
Never hand-write `['product', id]` inline — that is how `my-collections` vs
`myCollections` drift crept in. Add new keys to `src/lib/query/keys.ts`.

### The API layer
`src/lib/api/*` is the axios surface, **split by domain** (`auth`, `products`,
`catalog`, `orders`, `checkout`, `membership`, `messaging`, `trades`, `user`,
`media`) behind a thin `client.ts` (axios instance + interceptors). Import domain
APIs from `@/lib/api`. (`src/services/api.ts` is a backward-compat barrel that
re-exports `@/lib/api`; new code imports from `@/lib/api` directly.)

## 7. Forms — one abstraction (`@tarodan/ui-native/form`)

All forms use `useZodForm` + `Form`/`FormInput`/`FormError` from
`@tarodan/ui-native/form`. **No manual `useState`-per-field forms.** Colocate the
zod schema in the route's `_lib/schema.ts`.

```ts
import { useZodForm, Form, FormInput } from '@tarodan/ui-native/form';
import { offerSchema } from './_lib/schema';
const form = useZodForm(offerSchema);
```

## 8. State (zustand) is client/UI-only

Stores hold **only client/UI state** (auth token, cart, filters, drafts). A store
must **never fetch** — server data belongs in React Query. (Migrating
`favoritesStore`/`messagesStore` fetches to query hooks is Faz 1.)

## 9. Folder shape per route (mirror web)

`_`-prefixed folders are hidden from expo-router's route tree (same as
`__tests__`), so colocate freely:

```
app/<group>/<route>/
  index.tsx        # THIN screen: hooks + sections + modals composition (< ~150 lines)
  _lib/
    types.ts       # route DTO types
    schema.ts      # zod schema (colocated)
    status.ts      # status map / filter tabs / labels (single source)
  _hooks/
    useXxx.ts      # query hook → { data, isLoading }
    useDoXxx.ts    # mutation hook (snackbar + invalidateQueries owner)
  _sections/       # large screen sections / steps
  _components/     # route-local cards / rows
  _modals/         # dialogs; each owns its useZodForm + mutation
  [id]/            # dynamic segment; same shape
```

Shared, cross-route code:

```
src/
  lib/
    query/ { client.ts, keys.ts }   # QueryClient + central query-key registry
    api/   { client.ts, <domain>.ts } # axios surface split by domain
  hooks/     # ONLY cross-route hooks
  stores/    # zustand: client/UI state only (NO fetch)
  components/ { <feature>/ }
```

## 10. Imports — use the `@/` alias

Use `@/…` (→ `src/…`) instead of brittle `../../../src/…`. Metro (Expo SDK 54)
resolves tsconfig `paths` at runtime; jest maps `@/` in `jest.config.js`. Prefer
`@/lib/api`, `@/lib/query`, `@/components/...` over deep relative paths.

## 11. Loading / empty / error states

Use the shared `Spinner`/`ScreenLoader`, `EmptyState`, and `ErrorState` primitives
consistently — don't hand-roll per-screen loaders or empty views.

## 12. Canonical example — `app/offers/`

The offers screen is the **reference implementation** of this whole doc — copy its
shape when splitting any bloated screen. It went from one 1179-line file to a
< ~130-line `index.tsx` that only composes:

```
app/offers/
  index.tsx                 # THIN: hooks + <OffersTabs/> + <FlatList><OfferCard/></> + modals
  _lib/
    types.ts                # Offer / TabType / OfferStatus DTOs
    status.ts               # STATUS_CONFIG + formatPrice/getTimeRemaining/... (single source)
    schema.ts               # sellerCounterSchema / buyerCounterSchema (zod factories, dynamic bounds)
  _hooks/
    useOffers.ts            # query hook → list by tab (qk.offers.list)
    useCommissionPreview.ts # query hook → net-estimate map (replaces a useEffect+fetch)
    useOfferActions.ts      # accept/reject/cancel mutations (owns appAlert + invalidate)
    useDoCounterOffer.ts    # mutation, owned by CounterOfferModal
    useDoBuyerCounter.ts    # mutation, owned by BuyerCounterModal
    useInvalidateOffers.ts  # shared invalidation set (DRY — one source)
  _components/
    OffersAuthGate.tsx  OffersTabs.tsx  OffersEmpty.tsx  OfferCard.tsx
  _modals/
    CounterOfferModal.tsx   # owns its useZodForm + schema + mutation
    BuyerCounterModal.tsx
```

Patterns to copy:
- **Query hooks own the `queryKey`** (from `qk`) + `queryFn` (from `@/lib/api`); the
  screen never calls `api` or writes a key inline.
- **Mutation hooks own `appAlert` + `invalidateQueries`** — no manual `refetch()`.
  Per-item spinner comes from `mutation.variables` (`pendingOfferId`), not a
  `useState`.
- **Modals own their form + mutation**; the screen holds only `useState<Offer | null>`
  open/close state.
- **⚠️ Close the modal _before_ the mutation fires** — a mutation's `appAlert`
  (success or error) while a `ui-native` Modal is open freezes iOS. See §1 note and
  the `onSubmit` in `CounterOfferModal`.
- All feedback strings, status colors, and formatting live in `_lib/status.ts`, not
  scattered in JSX.

**Second worked example — `app/product/[id]/` (heavy screen).** Same shape applied
to a 1530-line screen (→ ~215-line `index.tsx`): query hooks with side effects
(`useProduct` owns the view-count POST + list invalidation), a `useProductActions`
hook that centralizes the snackbar + every handler (cart/offer/trade/report/share),
and presentational `_components` (`ProductInfo`, `SellerCard`, `ProductBottomBar`,
`ProductGallery`, …). Note two patterns for scale: hooks are called
**unconditionally before** the `isLoading` / not-found early returns (never
conditionally), and `useProductActions` accepts a nullable product with guarded
handlers so the hook order is stable while the screen is still loading. A
route-local loose `Product` DTO (`_lib/types.ts`) with an index signature keeps the
gradual `any` migration (Faz 4) from blocking the split.

**Third worked example — `app/trade/[id]/` (status machine).** The 1830-line trade
detail (→ ~170-line `index.tsx`) shows the pattern on a status-driven screen: a
single `useTradeActions` controller hook owns all 6 mutations + snackbar + both
modals' UI state; a pure `_lib/derive.ts` computes every derived value (party,
totals, shipment selectors, cash) once so JSX never re-derives; and the huge
status-conditional JSX splits into `TradeStatusHeader` / `TradeShippingSection` /
`TradeActions` etc., each rendering `null` when its status branch is inactive.
`_lib/status.ts` is the single source for the status maps, step flow, and countdown
helpers. `[id].tsx` became the folder `[id]/index.tsx` (expo-router resolves the
directory) — colocated tests importing `../[id]` keep working.

**Fourth worked example — `app/orders/[id]/` (many small cards + derived-heavy).**
The 1709-line order detail (→ ~145-line `index.tsx`) shows the pattern when a screen
is a long stack of small status-gated cards. A pure `_lib/derive.ts` computes the
~15 derived booleans/dates (isPaid, isPostShipment, isCancelled, showTrackingCard,
payoutReleaseDate, isPastRefundWindow, …) once; each presentational card
**self-gates** (returns `null` when its condition is false) so `index.tsx` is a flat
list of `<Order*Card>`s with no inline conditionals. Related tiny cards are grouped
per file (`OrderInfoCards`, `OrderActionCards`, `OrderInvoiceCards`) rather than one
file each. `useOrderActions` is the controller (refund/cancel/pay mutations + refund
modal form state + evidence picker + snackbar); `useOrderInvoices` owns the two
invoice queries + download handlers.

**Fifth worked example — `app/(tabs)/index.tsx` (display-heavy, huge stylesheet).**
The 1774-line home screen (→ ~103-line `index.tsx`) is display-only (8 queries, no
mutations, many sections). Two techniques for this shape: (1) the ~890-line
`StyleSheet` was moved **verbatim** to `_lib/styles.ts` and imported by every
section (a shared route-local stylesheet — the one place we don't colocate styles
per-component, because it's a single cohesive sheet and re-typing it per section
is pure transcription risk); (2) data lives in focused query hooks (`useHomeData`
= the 6 content queries, `useHomeBadges` = cart/fav/msg/notif counts + store
effects, `useHomeGuestPrompt`), navigation in `_lib/nav.ts`, and the JSX splits
into section components (`HomeHeader`, `HomeSections` exporting Hero/Categories/
Brands/Scales/FeaturedCollector/BoostedRail/PopularProducts/ProductsGrid/
Collections, plus `CompanyOfWeekSection`), each self-gating on its data.

**Sixth worked example — `app/checkout/` (multi-step form, payment flow).** The
1376-line checkout (→ ~105-line `index.tsx`) is a 3-step guest/auth checkout with
OTP, idempotency, and a delicate PayTR/bypass/stockout branch. The key discipline:
the payment-critical logic (`proceedCheckout`, guest-OTP, validation, payload
builders) was **extracted verbatim** into one controller hook (`useCheckout`) — a
lift, never a rewrite — and the screen just composes step sections
(`Step1Address`/`Step2Payment`/`Step3Confirm`), `CheckoutProgress`, `OrderSummary`,
`AddressSelector`, `OtpModal`. Pure helpers live in `_lib/{validation,constants,
types}`. When a flow is this risky, prefer one big verbatim controller hook over
clever re-decomposition of the logic itself.

## 13. Verification

- `npx tsc --noEmit` introduces **no new errors** beyond the tracked baseline.
- `pnpm --filter @tarodan/mobile lint` clean — no hardcoded hex/rgba, no
  `src/theme/colors` import, no raw manual forms where `useZodForm` fits.
- `pnpm --filter @tarodan/mobile test` green for touched routes.
- Exercise the changed flow in the app (Metro) — behavior unchanged.
