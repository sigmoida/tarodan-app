# Admin (apps/admin)

The admin panel: a private dashboard where every page is a Client Component and
all data is tables and CRUD. The shared frontend rules (thin pages,
`@tarodan/ui`, tokens, React Query, RHF + zod, i18n, light theme, TR phone) are
in the [root CLAUDE.md](../../CLAUDE.md), "Frontend". Assemble every page from
the recipes below (`ResourceList`, `DetailPage`, `col.*`, `FormModal`);
inventing a second way to list, show or edit is how a dashboard rots.
`docs/ADMIN_UI_CONTRACT.md` lists the shared layout primitives (`Panel`,
`SectionTitle`, `DetailLayout`, `TextLink`, `DataList`, `ProgressBar`).

## Layout and folders

- `src/app/(auth)/`: login, forgot password (centred card, "already logged in"
  redirect). `src/app/(admin)/`: the app (sidebar, providers; permissions
  hydrated once into `PermissionsContext`). One concern per route.
- Composites live in `src/components/<feature>/`; admin hooks in `src/hooks/`;
  API client, query keys and utils in `src/lib/`. The `(auth)` group is the
  reference for thin forms (`AuthCard`, `useLogin`).

```
app/(admin)/<resource>/
  page.tsx            # thin: <ResourceList> composition (~30 lines)
  _lib/  _components/
  [id]/
    page.tsx          # thin: useAdminItem + <DetailPage>
    _lib/  _sections/  _components/  _modals/
```

`(admin)/orders` and `(admin)/trades` are the canonical examples.

## Data

- Lists: `useAdminResource<T>({ queryKey, fetcher, ... })` (pagination,
  debounced search, filters, URL sync). One item: `useAdminItem<T>`.
- Writes: `useAdminMutation(fn, { invalidates: [resource], successMessage })`
  is the only way to mutate; it owns the toast and invalidation. Per-row busy:
  `mut.isPending && mut.variables === id`. Keys: `lib/query/keys.ts` (`adminKeys`).
- Full-load APIs (no server paging) go through `paginateClient`
  (`lib/query/client-list.ts`) so they use the same `ResourceList` pipeline.
- Copy that a shared hook or dialog cannot own (`successMessage`, confirm text)
  is passed in by the caller that has `t()`.

## List pages: `ResourceList` (`components/list/`)

```tsx
<ResourceList resource="orders" fetcher={(p) => adminApi.getOrders(p)}
  getRowId={(o) => o.id} syncUrl initialFilters={{ status: "all" }}>
  <ResourceList.Header title={t("admin.orders.title")} actions={...} />
  <ResourceList.Toolbar>
    <ResourceList.Search placeholder={...} />
    <ResourceList.FilterSelect name="status" options={statusOptions} />
  </ResourceList.Toolbar>
  <ResourceList.Table columns={columns} onRowClick={...} />
  <ResourceList.Pagination />
</ResourceList>
```

The root takes only data config; sub-parts read state from context. Columns are
module-level constants. Header bits that need list state are small
context-reading components (`DeepLinkFilterSummary`). Pages that transform rows
render `DataTable` from a page-local table (`orders/_components/OrdersTable`).

## Detail pages: `DetailPage` (`components/detail/`)

`DetailPage` = back link + query boundary + header (title, badge, actions) +
children; pass header props as `item && ...`. Build the body from `SectionCard`,
`PartyCard`, `Timeline`, `DataList`/`Field`. **Sensitive personal values (IBAN,
TC Kimlik No, identity numbers) render through `MaskedValue`**
(`components/MaskedValue.tsx`): hidden by default, click to reveal, length not
leaked.

## Tables: the `col.*` factory (`components/table/`)

Never write raw `ColumnDef` cell JSX. Columns come from `col.*`, which locks
alignment, truncation, font, size, width and the empty placeholder inside the
cell type; the page only says which field it shows. Migrate any table you touch.

- Producers: `title` (the one primary cell per table: main text + muted second
  line), `stacked`, `text`, `muted`, `money` (`tone`), `number`, `date`,
  `dateRange`, `link`, `user`, `product`, `status`, `toggle`, `actions`,
  `rowMenu`, `custom` (escape hatch; cell primitives from `cells.tsx`).
- **Badges:** every table badge is `TableBadge` (fixed `sm` size, no icon slot,
  variants `default | success | warning | danger | outline`); prefer
  `col.status`. Colours come from `STATUS_TONE` (`@/lib/status-tone`): live ->
  success, pending -> default, ended -> warning, failed -> danger, inactive ->
  outline. Never put icons in badges or pick ad-hoc colours.
- **Widths:** per-kind constants `COL_WIDTH` / `COL_SIZE` (`widths.ts`); spread
  `COL_SIZE.date` etc. to pin a column. No magic pixel widths.
- **Toggles:** on/off columns use `col.toggle` (switch + state text), not a
  custom cell.
- **No monospace:** codes and references render as plain text (`col.text`,
  `col.title`). `col.code` / `font-mono` cells are legacy (finance PSP and
  reconciliation tabs); migrate them when touched.
- Sorting is on by default; a function accessor needs an explicit `sortKey` or
  `{ sortable: false }`.
- Guaranteed behaviour: text never wraps (truncate + tooltip only when
  clipped); columns grow by weight and scroll horizontally only below the sum
  of minimum widths (tune with `col.x(header, get, { grow, minWidth })`);
  header and cell alignment always match.
- Status badges outside tables read the shared configs from `@tarodan/ui`
  (`orderStatusConfig`, ...); no local status maps.

## Forms and CRUD

- Create/edit is a self-contained modal per resource in `_modals/`, owning its
  `useZodForm`, schema and `useAdminMutation`, framed by `FormModal`
  (`destructive` for danger confirms). The page holds
  `useState<{ item? } | null>` and mounts the modal with
  `key={item?.id ?? "new"}` so defaults reseed on each open.
- Delete goes through `useConfirm` (`provider/ConfirmProvider`) + a mutation; no
  bespoke delete modal.
- Schemas live in the resource's `_lib/schema.ts`; only cross-feature schemas in
  `lib/schemas/`. zod validates only; string -> number shaping happens in the
  `mutationFn`.
- `ActiveBadge` / `StatusToggle` for `isActive`; row buttons are
  `ActionIconButton` (`components/AdminList.tsx`) inside `col.actions`, or a
  `col.rowMenu`. `(admin)/catalog/*` are the
  canonical CRUD pages.

## Copy and formatting

`@tarodan/no-hardcoded-turkish` is an error here. Dates, money and numbers go
through `lib/format.ts` (`fmtTry`, `fmtNumber`, `fmtPercent`, `fmtDate`,
`fmtDateTime`, `fmtTime`; null-safe, Europe/Istanbul).
No emoji or pictographs in copy; use design-system icons.

## Verification

```bash
pnpm --filter @tarodan/admin typecheck
pnpm --filter @tarodan/admin lint
pnpm --filter @tarodan/admin exec vitest run <paths>
pnpm --filter @tarodan/admin test:api
pnpm --filter @tarodan/admin build      # only for routing changes
```

Pure logic (mappers, formatters, permission and status derivations) gets a
colocated `*.test.ts`. Then check the screen: lists paginate and filter through
the URL and survive a reload, detail pages show loading, error and empty states,
and a write refreshes its list without a manual refetch (if not, the
`invalidates` resource name is wrong).
