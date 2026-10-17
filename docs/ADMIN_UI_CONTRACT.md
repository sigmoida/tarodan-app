# Admin UI consolidation — shared component contract

Base: branch `development` at c4b98a5a7 or later. Scope: `apps/admin/src` (plus `packages/ui` where stated).
Owner decisions: inner-box radius is `rounded-lg`; text links are underlined; percentages read "%12" (Turkish style, sign first).
Rule: if a shared component exists for a visual thing, pages must use it; no hand-written class recipes for it.

## Shared components (exact paths and props — the foundation agent implements these, area agents import them)

1. `@/components/detail/Panel` — the inner box / sub-card (SectionCard stays the OUTER card).
   `Panel({ tone?: "default" | "muted"; padding?: "sm" | "md"; className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>)`
   default tone = `bg-surface`, muted = `bg-surface-alt`; padding sm = `p-3`, md (default) = `p-4`; always `rounded-lg border border-border`. No shadow.

2. `Alert` from `@tarodan/ui` — existing props `variant`, `title`, `icon`, `onClose`, children. NEW: `title` accepts ReactNode; `action?: ReactNode` rendered below the body (buttons). All tinted callouts/banners use this.

3. `@/components/detail/SectionTitle`
   `SectionTitle({ children: ReactNode; as?: "h2" | "h3" | "h4"; size?: "md" | "sm"; actions?: ReactNode; className?: string })`
   md = `text-base font-semibold text-heading`, sm = `text-sm font-semibold text-heading`; default as="h3", size="md". `actions` is right-aligned on the same row.
   `Eyebrow({ children: ReactNode; className?: string })` from the same file — `text-xs font-semibold uppercase tracking-wide text-muted`.

4. `@/components/TextLink`
   `TextLink({ href: string; children: ReactNode; external?: boolean; mono?: boolean; title?: string; className?: string } )` — next/link (or `<a target="_blank" rel="noreferrer">` when external); `text-primary-600 underline underline-offset-2 hover:text-primary-700`. `CellLink` in `components/table/cells.tsx` is re-implemented on top of it.

5. `@/components/detail/DetailLayout`
   `DetailLayout({ main: ReactNode; aside?: ReactNode; className?: string })` — `grid grid-cols-1 gap-6 lg:grid-cols-3`; main is `space-y-6 lg:col-span-2` (full width when there is no aside); aside is `space-y-6`.

6. `@/components/detail/DataList` (exists): `DataList({ columns?: 1 | 2 | 3; children })`, `Field({ label: ReactNode; children: ReactNode; layout?: "inline" | "stacked"; mono?: boolean })`. inline (default) = label left muted, value right-aligned heading; stacked = label on top (`text-xs text-muted`), value below. All label/value rows use this.

7. `@/components/ProgressBar`
   `ProgressBar({ value: number /* 0–100, clamped */; tone?: "default" | "success" | "warning" | "danger"; className?: string; "aria-label"?: string })` — `h-2 rounded-full bg-surface-alt` track.

8. `@/lib/format` (exists: fmtTry, fmtNumber, fmtDate, fmtDateTime, fmtTime, all Europe/Istanbul). NEW:
   `fmtPercent(value?: number | string | null, fractionDigits = 0): string | undefined` → "%12", "%12,5" (tr-TR decimal comma);
   `fmtFileSize(bytes?: number | null): string | undefined` → "1,2 MB".
   All dates/money/percent/file sizes in the UI go through this file; no ad hoc toLocaleString/date-fns formatting.

9. `@/components/DataTable` (exists). NEW optional props: `footer?: ReactNode` (rendered inside `<tfoot>`; caller passes `TableRow`/`TableCell` from `@tarodan/ui`, e.g. a totals row), `dense?: boolean` (a table embedded INSIDE a card: tighter rows and no frame/shadow of its own, so there is never a border inside a border). Column groups: pass tanstack grouped columns (`{ header, columns: [...] }`); the header-group rows are rendered. Every `<table>` in admin goes through DataTable, except `PermissionMatrixGrid` (documented exception).

10. Already existing, to be used instead of hand-rolled equivalents: `EmptyState` (`size="compact"` inside cards), `Spinner`, `Skeleton`, `Avatar`, `Badge` (variants: default, success, warning, danger, outline — nothing else exists), `Button`/`IconButton`, `MetricCard` (`@/components/MetricCard`: label, value, optional change/footer; no icon), `SectionCard`, `PageHeader`, `AdminTabs` (no icons; `badge` renders as "Label (n)").

11. Status colours: every status badge reads the shared configs exported from `@tarodan/ui` (`orderStatusConfig`, `productStatusConfig`, `paymentStatusConfig`, `ticketStatusConfig`, `accountStatusConfig`, … see `packages/shared/src/status-configs.ts`) via `<Badge status={x} config={...} />`. Local status→variant/colour maps that duplicate a shared one are deleted; if a local map carries statuses the shared one lacks, add them to the shared config instead (and say so in your report).
