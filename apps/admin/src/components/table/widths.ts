/**
 * Shared column widths (px) — one value per column KIND, so the same kind of
 * column (date, status badge, amount, …) is equally wide in every table.
 *
 * The `col.*` defaults read these, so a table that doesn't pass a width already
 * gets them. A table that wants the kind's width to stay fixed (not grow with
 * spare space) spreads the matching `COL_SIZE` entry into the column options:
 *
 *   col.date("Tarih", (r) => r.createdAt, { ...COL_SIZE.date, sortKey: "createdAt" })
 *
 * Sizes are tuned for the Turkish copy at `text-sm`, which is the longer locale:
 *  - date      `03.07.2026` (+ optional muted time)
 *  - dateRange `03.07.2026 – 10.07.2026`
 *  - status    the longest single-line badge label (`Kampanya bitti`, `Süresi doldu`)
 *  - amount    `₺12.345,67`
 *  - count     a short number or `12 / 100`
 *  - toggle    a compact on/off switch + its state text
 */
export const COL_WIDTH = {
  /** Thumbnail / preview image column (80px image + cell padding). */
  preview: 112,
  /** The row's main cell (`col.title`) — flexible. */
  title: 240,
  /** Free / secondary text (`col.text`, `col.muted`, codes with a badge) — flexible. */
  text: 180,
  /** Longer secondary text (description, subject) — flexible. */
  description: 240,
  /** Short enum-like label (position, platform, scope, icon name). */
  label: 140,
  /** Pixel size + IAB badge (`728×90 IAB dışı`). */
  size: 150,
  date: 140,
  dateRange: 200,
  status: 160,
  /** Status badge whose label carries a qualifier (`Görünmüyor · uygulama`, `Yayında · web gizli`). */
  statusLong: 220,
  /** Two side-by-side content badges (`HTML e-posta` `Pazarlama`). */
  badgeGroup: 220,
  amount: 120,
  /** Two amounts in one cell (`₺1.000 / ₺5.000`, a price range, old + campaign price). */
  amountRange: 200,
  count: 100,
  /** Switch + its visible `Aktif` / `Pasif` text. */
  toggle: 120,
  /** Inline action buttons (`col.actions`). */
  actions: 96,
  /** The ⋮ row menu (`col.rowMenu`). */
  rowMenu: 72,
} as const;

export type ColWidthKind = keyof typeof COL_WIDTH;

/** Fixed-width column options per kind — spread into a `col.*` call's opts. */
export const COL_SIZE = Object.fromEntries(
  Object.entries(COL_WIDTH).map(([kind, minWidth]) => [
    kind,
    { minWidth, fixed: true },
  ]),
) as { readonly [K in ColWidthKind]: { minWidth: number; fixed: true } };
