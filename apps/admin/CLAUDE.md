# Admin — UI & Frontend Principles

Guidance for building UI in `apps/admin`. Read this before adding routes,
components, or hooks. These rules are enforced partly by ESLint
(`@tarodan/eslint-config/next`) and partly by review.

## 1. Base components come from `@tarodan/ui`

Never rebuild a primitive that already exists in `@tarodan/ui` (Button, Input,
Select, Textarea, Checkbox, Radio, Label, FormField, Card, Badge, StatusBadge,
Spinner, Modal, …). Import from `@tarodan/ui`.

- Raw `<button>`, `<input>`, `<select>`, `<textarea>` are **ESLint errors** —
  use the component. (`<input type="file">` is the only raw-input exception.)
- Need a variant/state that doesn't exist? Add it to `@tarodan/ui` (shared),
  don't fork a local copy.
- App-specific composite components (built _from_ `@tarodan/ui`) live in
  `src/components/…`.

## 2. Everything flows from design tokens

Colors, spacing, radius, and typography come from `@tarodan/design-tokens`
(via the Tailwind preset). In markup use **semantic token classes only**:
`primary`, `danger`, `success`, `info`, `warning`, `surface`, `surface-alt`,
`surface-elevated`, `heading`, `body`, `muted`, `subtle`, `border`, `inverted`.

- Raw Tailwind palette (`bg-gray-100`, `text-red-500`, …) and raw `white`/`black`
  utilities are **ESLint errors**.
- No hardcoded hex / rgba in components.
- Don't re-pass a component's built-in defaults (e.g. `border`, `rounded-lg`,
  `focus:ring-primary-200` on `<Input>`) — ESLint flags these as redundant.

## 3. Thin components, logic in hooks

A component should mostly render. Put data-fetching, form submission, and
side effects in a hook.

- Admin-specific logic → `src/hooks/` (e.g. `useLogin`, `useForgotPassword`,
  `useAdminResource`).
- Logic that is (or will be) shared across apps → a **package**, not here.
  Auth hooks are admin-only (mobile/web have their own), so they stay local.
- Use React context only when state is genuinely shared across a subtree
  (global auth already lives in the `authStore` zustand store — don't wrap it
  in another context "just because").

## 4. DRY — never duplicate

If you're about to copy a block, extract it (component, hook, or constant).

- Render shared elements **once** outside conditionals rather than in each
  branch (see `ForgotPasswordForm`: one "back to login" link, not two).
- Duplicated config/data (status maps, option lists, labels) is the most
  dangerous kind — it drifts silently. Keep one source of truth; prefer the
  shared `@tarodan/shared` status configs.
- Before writing a helper, check `@tarodan/ui`, `@tarodan/shared`,
  `src/lib/`, and `src/hooks/` for an existing one.

## 5. Small component APIs

Many props = a design smell. If a component needs a long prop list, it's
probably doing too much — split it, or lift composition to the caller
(`children`, slots) instead of flags.

- Prefer composition (`<AuthCard title=…>{children}</AuthCard>`) over
  configuration (`<AuthCard title subtitle footer showX showY …>`).

## 6. Layouts & routing (App Router)

Separate concerns with **route groups**, each with its own `layout.tsx`:

- `src/app/(auth)/` — unauthenticated pages (login, forgot-password). Auth
  layout: centered card frame, brand, no admin chrome. Shared brand
  header/footer + "already logged in?" redirect live in the layout.
- `src/app/(admin)/` — authenticated app. Admin layout: sidebar/topbar +
  providers (query/confirm/prompt).
- One screen = one concern. A toggle inside a page that swaps between two
  distinct flows (e.g. login vs forgot-password) should be **two routes**,
  not one component with a mode flag.

## 7. Folder organization

```
src/
  app/
    (auth)/            # login, forgot-password  → auth layout
    (admin)/           # dashboard & everything else → admin layout
    layout.tsx         # root (fonts, Toaster, AuthBootstrap)
  components/
    <feature>/         # feature-scoped composites, e.g. components/auth/
    …                  # cross-cutting admin components
  hooks/               # admin-specific hooks
  lib/                 # api client, stores, utils
```

Feature components live under `components/<feature>/` (e.g. `components/auth/`),
not scattered at the components root.

## 8. Shared config is upstream — don't fork it

`tsconfig`, Tailwind, and ESLint all extend shared packages
(`@tarodan/tsconfig/nextjs`, `@tarodan/design-tokens/tailwind`,
`@tarodan/eslint-config/next`). App config files only hold app-specific bits
(paths, content globs, one-off animations). Change a shared rule in the
package, not by overriding here.

---

### Reference example: the auth refactor

The `(auth)` group is the canonical example of these rules:

- **Routes**: `(auth)/login` + `(auth)/forgot-password` (separate routes, one
  auth layout) instead of a single login page with a `forgotMode` toggle.
- **Components** (`components/auth/`): `AuthCard` (tiny `title`+`children` API,
  wraps the design-system `Card`), `LoginForm`, `ForgotPasswordForm` — all
  built from `@tarodan/ui` `Button`/`Input`.
- **Hooks** (`hooks/`): `useLogin`, `useForgotPassword`,
  `useRedirectIfAuthenticated` — the pages/forms stay thin.
- **No raw primitives, no palette colors, no inline spinner** (`Button
  isLoading` handles it), links are `next/link`.

---

## 9. Data & pages — the list/detail/mutation recipe

Every page is a client component; **all** server data goes through TanStack
Query. Never `useState` + `useEffect` + `adminApi` by hand.

### Data layer (`lib/query/`, `hooks/`)
- **Lists** → `useAdminResource<T>({ queryKey, fetcher, … })` (pagination,
  debounced search, filters, URL sync). `queryKey` = the resource name.
- **Single item** → `useAdminItem<T>({ resource, id, fetcher })`.
- **Writes** → `useAdminMutation(fn, { invalidates: [resource…], successMessage })`
  — the ONLY way to mutate. Owns the toast + `invalidateQueries`, so lists/details
  refresh automatically (no manual `refetch()`). Per-row busy:
  `mut.isPending && mut.variables === id`. Keys: `lib/query/keys.ts`.

### List pages → the `ResourceList` compound (`components/list/`)
No prop-explosion: the root takes only the data config; sub-parts read state from
context (`useResourceList` / `useFilter`).

```tsx
<ResourceList resource="orders" fetcher={(p) => adminApi.getOrders(p)}
  getRowId={(o) => o.id} syncUrl initialFilters={{ status: 'all' }}>
  <ResourceList.Header title="Siparişler" description={<OrdersSummary />} actions={…} />
  <ResourceList.Toolbar>
    <ResourceList.Search placeholder="…" />
    <ResourceList.FilterSelect name="status" options={statusOptions} />
    {/* or <ResourceList.DateRange /> */}
  </ResourceList.Toolbar>
  <ResourceList.Table columns={columns} onRowClick={…} />
  <ResourceList.Pagination />
</ResourceList>
```
- Columns live at **module level** (static). Header bits that need list state
  (total, active-filter notice) are tiny context-reading components rendered
  inside `<ResourceList>` (e.g. `OrdersSummary`).
- Pages that transform rows (accordion, mapping) read `rows` from context in a
  page-local `…Table` component and render `DataTable` directly (see
  `orders/_components/OrdersTable`).

### Detail pages → `DetailPage` + section primitives (`components/detail/`)
`DetailPage` = back link + QueryBoundary + header (title/badge/actions) + children.
Build the body from `SectionCard`, `PartyCard`, `Timeline`, `DataList`/`Field`.
Pass header props as `item && …` so they only evaluate once loaded.

```tsx
const { item, isLoading, error, refetch } = useAdminItem<T>({ resource, id, fetcher });
return (
  <DetailPage backHref="/orders" isLoading={isLoading} error={error} isEmpty={!item}
    onRetry={refetch} title={item && …} badge={item && <StatusBadge …/>} actions={item && …}>
    {item && <>{/* sections */}</>}
  </DetailPage>
);
```

### Modals & panels are separate components
Every dialog/modal is its **own** component that owns its form + validation +
`useAdminMutation` (built on the shared `Modal`). The page only holds the
open/close state. Action panels that trigger a mutation own it too (see
`trades/[id]/_sections/CompensationPanel`, `_modals/*`).

### Folder shape per page
```
app/(admin)/<resource>/
  page.tsx                 # thin: <ResourceList> composition (~30 lines)
  _lib/…                   # types, mappers, static option lists
  _components/…            # page-local table / summary / header-actions
  [id]/
    page.tsx               # thin: useAdminItem + <DetailPage> (~100-280 lines)
    types.ts  _lib/  _sections/  _components/  _modals/
```

The `(admin)/orders` and `(admin)/trades` pages are the canonical examples.
Apply the same recipe to every new admin section.

---

## 10. Table columns — the `col.*` factory (`components/table/`)

Never write raw `ColumnDef` cell JSX. Columns are built with the typed **column
factory** so alignment, truncation, font/size, formatting, width and the
empty-value placeholder are locked **inside the cell type** — cross-table
inconsistency becomes impossible. The page only declares *which field* it shows.

```tsx
import { col } from '@/components/table';

const columns = [
  col.link('Sipariş', r => ({ href: `/operations/orders/${r.order.id}`, label: `#${r.order.no}` })),
  col.user('Alıcı',  r => ({ name: r.buyer.name, secondary: r.buyer.email, href: `/users/${r.buyer.id}` })),
  col.money('Tutar', r => r.amount, { tone: 'negative' }),   // ₺, right, tabular-nums
  col.date('Tarih',  r => r.createdAt),                       // short date, hover = full timestamp
  col.badge('Durum', r => <StatusBadge status={r.status} config={cfg} />),  // never wraps
  col.actions(r => <RowMenu id={r.id} />, { header: 'İşlemler' }),          // right, nowrap
];
```

Generators: `text` · `muted` · `money` (`tone`) · `number` · `date` · `code`
(mono) · `link` · `user` · `badge` · `actions` · `custom` (escape hatch — free
JSX but still aligned/sized via meta). Format helpers live in **`lib/format.ts`**
(`fmtTry`/`fmtNumber`/`fmtDate`/`fmtDateTime`, all null-safe → `—`). Cell
primitives are in `components/table/cells.tsx`; use them directly only inside
`col.custom` (e.g. `<CellText>`, `<CellCode>`, `<TruncatedText>`).

### Behaviour the factory guarantees
- **Text never wraps** — `truncate` + `…`; a native tooltip shows the full value
  **only when actually clipped** (`TruncatedText` measures overflow).
- **Responsive width** — each column has a `grow` weight + `minWidth`. On wide
  screens columns expand proportionally; as the viewport shrinks they narrow and
  truncate; below `Σ(minWidth)` the table scrolls horizontally (no scroll before
  that). Tune with `col.x(header, get, { grow, minWidth })`.
- **Alignment** — header and cell always match (money/number/actions → right),
  driven by column `meta`; `DataTable` reads it and renders `<colgroup>` +
  `table-fixed`. This sizing path is **opt-in**: it only activates when columns
  carry meta (i.e. came from `col.*`), so legacy raw-`ColumnDef` tables are
  untouched.

Migrate any table you touch to `col.*`. The `(admin)/operations/*` list pages
are the canonical examples.

---

## 11. Forms & CRUD — the modal + RHF/zod recipe

Create/edit is a **self-contained modal component** per resource (never inline
overlays on the page). Delete goes through the shared **`useConfirm`** provider
(`components/ConfirmProvider`) + a `useAdminMutation` — no bespoke delete modal.

### Form layer (`@tarodan/ui/form` + `components/form/`)
- **`FormModal`** (`components/form/FormModal.tsx`) = design-system `Modal` + the
  RHF `Form` + a standard Cancel/Submit footer. The resource modal owns the
  `form` (from `useZodForm`) and the `useAdminMutation`; FormModal just frames them.
- **RHF field wrappers** (`@tarodan/ui/form`): `FormInput`, `FormSelect`,
  `FormTextarea`, `FormCheckbox`, `FormImageUpload`. Each auto-wires value + error
  from context by `name` — never thread `register`/`error` by hand. `FormImageUpload`
  takes an injected `upload` fn (`adminApi.uploadMedia`).
- **Schemas** live in `lib/schemas/catalog/*.ts` (one per resource, `z.infer` types
  exported). Keep zod **validation-only** — shape string→number/null in the
  `mutationFn`, so `z.infer` types stay honest (native number/select inputs yield
  strings).

```tsx
// _modals/CategoryFormModal.tsx
const form = useZodForm(categorySchema, { defaultValues: category ?? { name: '', isActive: true } });
const save = useAdminMutation(
  (v) => (isEdit ? adminApi.updateCategory(id, v) : adminApi.createCategory(v)),
  { invalidates: ['categories'], successMessage: '…', onSuccess: onClose },
);
return (
  <FormModal open onClose title={…} form={form} onSubmit={(v) => save.mutate(v)}
    isSubmitting={save.isPending} submitLabel={isEdit ? 'Güncelle' : 'Oluştur'}>
    <FormInput name="name" label="Ad" />
    <FormCheckbox name="isActive" label="Aktif" />
  </FormModal>
);
```
Page side stays thin: `const [modal, setModal] = useState<{item?}|null>(null)` and
mount with `key={item?.id ?? 'new'}` so `useZodForm` defaults seed fresh per open.

### Lists over full-load APIs
Some catalog APIs return the whole list (no server paging/search). Wrap them with
**`clientListFetcher`** / `paginateClient` (`lib/query/clientList.ts`) so they run
through the same `ResourceList` pipeline; server-paginated resources pass their
`adminApi.getX` fetcher directly.

### Shared bits
`ActiveBadge` / `StatusToggle` (`components/ActiveBadge.tsx`) for `isActive` display
+ one-click toggle. Row edit/delete buttons: `ActionIconButton` inside `col.actions`.

The `(admin)/catalog/*` pages are the canonical CRUD examples (`categories` = the
simplest, `products` = list+detail+tabs, `brands` = shared `CarModelFormModal`).
