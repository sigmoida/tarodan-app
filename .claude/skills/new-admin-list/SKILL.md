---
name: new-admin-list
description: Build or migrate an admin list page in apps/admin with ResourceList, the col.* column factory and the table rules (TableBadge, STATUS_TONE, COL_SIZE, col.toggle), plus its detail page and CRUD modals. Use for any new admin section or table.
argument-hint: "<resource> <what the list shows>"
---

# New admin list

Resource: $ARGUMENTS

Read `apps/admin/CLAUDE.md` first. Canonical examples: `(admin)/orders`,
`(admin)/trades` (list + detail), `(admin)/catalog/*` (CRUD),
`(admin)/marketing/*` (current table rules).

## 1. API client and keys

- Add the fetcher to `apps/admin/src/lib/api/` (`adminApi.getX(params)`), then
  `pnpm --filter @tarodan/admin test:api` (export names stay unique).
- Server-paginated: pass the fetcher directly. Full-load API: wrap it with
  `paginateClient` (`lib/query/client-list.ts`).
- The backend route needs a `PERMISSION_MAP` entry (API `RolesGuard`).

## 2. Page

```
app/(admin)/<resource>/
  page.tsx            # ~30 lines: <ResourceList> composition
  _lib/columns.tsx    # module-level column array
  _lib/schema.ts      # zod schema for the modal
  _modals/<Resource>FormModal.tsx
  [id]/page.tsx       # useAdminItem + <DetailPage>
```

`page.tsx`: `<ResourceList resource="x" fetcher={...} getRowId={...} syncUrl>`
with `Header`, `Toolbar` (`Search`, `FilterSelect`, `DateRange`), `Table` and
`Pagination`.

## 3. Columns (`@/components/table`)

- Exactly one `col.title` (main text + muted second line).
- `col.text`, `col.muted`, `col.stacked`, `col.money`, `col.number`,
  `col.date`, `col.dateRange`, `col.link`, `col.user`, `col.product`.
- State: `col.status` returning `TableBadge` props; colours from `STATUS_TONE`
  (`@/lib/status-tone`): live success, pending default, ended warning, failed
  danger, inactive outline. Fixed `sm`, no icons.
- On/off: `col.toggle` (wire `onChange` to a `useAdminMutation`).
- Widths: spread `COL_SIZE.<kind>` / `COL_WIDTH`; no pixel literals.
- No monospace: codes as `col.text`. Actions: `col.actions` with
  `ActionIconButton`, or `col.rowMenu`.
- Function accessors need `sortKey` or `{ sortable: false }`.

## 4. Detail and mutations

- `DetailPage` + `SectionCard` / `DataList` / `Timeline`; IBAN and identity
  numbers through `MaskedValue`.
- Every write is `useAdminMutation(fn, { invalidates: ["x"], successMessage })`.
- Create/edit modal owns `useZodForm` + mutation inside `FormModal`; mount with
  `key={item?.id ?? "new"}`. Delete = `useConfirm` + mutation.
- All copy from `@tarodan/i18n` (`admin.<area>.*`, tr + en); formatting via
  `lib/format.ts`.

## 5. Verify

```bash
pnpm --filter @tarodan/admin typecheck
pnpm --filter @tarodan/admin lint
pnpm --filter @tarodan/admin test:api
pnpm --filter @tarodan/admin exec vitest run <touched tests>
```

Then check: the list filters and paginates through the URL and survives a
reload, and a write refreshes the list without a manual refetch.
