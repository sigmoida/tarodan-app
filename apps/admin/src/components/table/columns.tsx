/** @format */

import { type ColumnDef } from "@tanstack/react-table";
import { type ReactNode } from "react";
import { type CellColumnMeta, type SortType } from "./meta";
import {
  CellActions,
  CellBadge,
  CellCode,
  CellDate,
  CellLink,
  CellMoney,
  CellMuted,
  CellNumber,
  CellText,
  CellUser,
  type MoneyTone,
} from "./cells";
import { RowActionMenu, type RowActionItem } from "./RowActionMenu";

/**
 * Typed column factory. Instead of raw `ColumnDef`, use producers like
 * `col.text(...)`, `col.money(...)`; alignment, truncate, format, width and
 * spacing behavior are locked inside the type → cross-table inconsistency is impossible.
 * The only responsibility left on the page: which field you show.
 *
 *   const columns = [
 *     col.link('Sipariş', r => ({ href: `/orders/${r.id}`, label: `#${r.no}` })),
 *     col.user('Alıcı', r => ({ name: r.buyer.name, secondary: r.buyer.email })),
 *     col.money('Tutar', r => r.amount),
 *     col.date('Tarih', r => r.createdAt),
 *     col.badge('Durum', r => <StatusBadge status={r.status} />),
 *     col.actions(r => <RowMenu id={r.id} />),
 *   ];
 */

type Row<T> = { original: T };
export interface ColOpts extends CellColumnMeta {
  /** react-table column id; required when the header isn't a string or is empty. */
  id?: string;
}

/**
 * An accessor is either a plain field key (string) or a getter function.
 * The string form auto-builds the getter AND opts the column into sorting:
 * `meta.sortKey`/`sortable`/`sortType` are filled from the producer type.
 * The function form is sortable only when `{ sortKey }` is passed explicitly.
 */
type Accessor<T, V> = string | ((r: T) => V);

// Cell producer → default client comparator family (see meta.ts SortType).
const SORT_TYPE: Partial<Record<keyof typeof DEFAULTS, SortType>> = {
  text: "text",
  muted: "text",
  code: "text",
  link: "text",
  user: "text",
  money: "number",
  number: "number",
  date: "date",
};

/**
 * Resolve a string-or-function accessor into a getter + the sort-related opts.
 * String key → getter reads `r[key]` and the column becomes sortable by that key.
 */
function field<T, V>(
  accessor: Accessor<T, V>,
  opts: ColOpts = {},
): [get: (r: T) => V, opts: ColOpts] {
  if (typeof accessor === "string") {
    const key = accessor;
    return [
      (r) => (r as Record<string, unknown>)[key] as V,
      { sortKey: key, ...opts },
    ];
  }
  return [accessor, opts];
}

// minWidth = the column's base px width: both its share of the horizontal-scroll
// threshold (Σ minWidth) and its proportional growth weight on wide screens. `grow`
// NO LONGER affects width (the table is driven by `<table>` min-width + `table-fixed`);
// we keep the field for backward compatibility. To widen/narrow a column, set
// `minWidth`.
const DEFAULTS = {
  text: { grow: 3, minWidth: 160, align: "left" },
  muted: { grow: 2, minWidth: 140, align: "left" },
  money: { grow: 1, minWidth: 120, align: "right" },
  number: { grow: 1, minWidth: 100, align: "right" },
  date: { grow: 1, minWidth: 120, align: "left" },
  code: { grow: 2, minWidth: 140, align: "left" },
  link: { grow: 3, minWidth: 150, align: "left" },
  user: { grow: 4, minWidth: 190, align: "left" },
  badge: { grow: 1, minWidth: 160, align: "left" },
  actions: { grow: 1, minWidth: 120, align: "right" },
  custom: { grow: 2, minWidth: 160, align: "left" },
} as const;

function base<T>(
  type: keyof typeof DEFAULTS,
  header: ReactNode,
  cell: (row: T) => ReactNode,
  opts: ColOpts = {},
): ColumnDef<T, unknown> {
  const d = DEFAULTS[type];
  const id = opts.id ?? (typeof header === "string" && header ? header : type);
  // Sort is opt-in: a column is sortable only when it carries a `sortKey`
  // (string-accessor form auto-adds it; function form needs it explicitly).
  // `actions`/`rowMenu` are never sortable.
  const sortKey = opts.sortKey;
  const sortable =
    type !== "actions" && sortKey != null && opts.sortable !== false;
  const sortType = sortable ? (opts.sortType ?? SORT_TYPE[type]) : undefined;
  return {
    id,
    header: () => header,
    cell: ({ row }: { row: Row<T> }) => cell(row.original),
    meta: {
      align: opts.align ?? d.align,
      minWidth: opts.minWidth ?? d.minWidth,
      grow: opts.grow ?? d.grow,
      ...(sortable ? { sortKey, sortable, sortType } : {}),
    },
  };
}

export const col = {
  /** Free text (truncate + hover). Pass a field key to make it sortable. */
  text<T>(header: ReactNode, get: Accessor<T, ReactNode>, opts?: ColOpts) {
    const [g, o] = field(get, opts);
    return base<T>("text", header, (r) => <CellText value={g(r)} />, o);
  },
  /** Secondary/muted text. Pass a field key to make it sortable. */
  muted<T>(header: ReactNode, get: Accessor<T, ReactNode>, opts?: ColOpts) {
    const [g, o] = field(get, opts);
    return base<T>("muted", header, (r) => <CellMuted value={g(r)} />, o);
  },
  /** Money (₺, right, tabular-nums). `tone` only changes the color. */
  money<T>(
    header: ReactNode,
    get: Accessor<T, number | string | null | undefined>,
    opts?: ColOpts & { tone?: MoneyTone },
  ) {
    const [g, o] = field(get, opts);
    return base<T>(
      "money",
      header,
      (r) => <CellMoney value={g(r)} tone={opts?.tone} />,
      o,
    );
  },
  /** Plain number (right, tabular-nums). Pass a field key to make it sortable. */
  number<T>(
    header: ReactNode,
    get: Accessor<T, number | string | null | undefined>,
    opts?: ColOpts,
  ) {
    const [g, o] = field(get, opts);
    return base<T>("number", header, (r) => <CellNumber value={g(r)} />, o);
  },
  /** Short date (full time on hover). Pass a field key to make it sortable. */
  date<T>(
    header: ReactNode,
    get: Accessor<T, string | number | Date | null | undefined>,
    opts?: ColOpts,
  ) {
    const [g, o] = field(get, opts);
    return base<T>("date", header, (r) => <CellDate value={g(r)} />, o);
  },
  /** ID / tracking no (mono, clipped). Pass a field key to make it sortable. */
  code<T>(header: ReactNode, get: Accessor<T, ReactNode>, opts?: ColOpts) {
    const [g, o] = field(get, opts);
    return base<T>("code", header, (r) => <CellCode value={g(r)} />, o);
  },
  /** Text link. If it returns `null`, empty placeholder. */
  link<T>(
    header: ReactNode,
    get: (
      r: T,
    ) => { href?: string | null; label?: ReactNode } | null | undefined,
    opts?: ColOpts,
  ) {
    return base<T>(
      "link",
      header,
      (r) => {
        const v = get(r);
        return <CellLink href={v?.href} label={v?.label} />;
      },
      opts,
    );
  },
  /** Person/entity (name + optional sub-line). */
  user<T>(
    header: ReactNode,
    get: (
      r: T,
    ) =>
      | { name?: ReactNode; secondary?: ReactNode; href?: string | null }
      | null
      | undefined,
    opts?: ColOpts,
  ) {
    return base<T>(
      "user",
      header,
      (r) => {
        const v = get(r);
        return (
          <CellUser name={v?.name} secondary={v?.secondary} href={v?.href} />
        );
      },
      opts,
    );
  },
  /** Badge (no wrap). `render` returns the badge JSX. */
  badge<T>(header: ReactNode, render: (r: T) => ReactNode, opts?: ColOpts) {
    return base<T>(
      "badge",
      header,
      (r) => <CellBadge>{render(r)}</CellBadge>,
      opts,
    );
  },
  /** Action area (right-aligned). Header defaults to empty. */
  actions<T>(
    render: (r: T) => ReactNode,
    opts?: ColOpts & { header?: ReactNode },
  ) {
    return base<T>(
      "actions",
      opts?.header ?? "",
      (r) => <CellActions>{render(r)}</CellActions>,
      {
        id: "actions",
        ...opts,
      },
    );
  },
  /**
   * Row actions — standard ⋮ menu. The page only returns the list of actions
   * (conditional actions via `cond && {...}`). This is the preferred way for row
   * actions; a single, consistent mechanism instead of an inline icon cluster.
   */
  rowMenu<T>(
    getItems: (r: T) => RowActionItem[],
    opts?: ColOpts & { header?: ReactNode },
  ) {
    return base<T>(
      "actions",
      opts?.header ?? "",
      (r) => (
        <CellActions>
          <RowActionMenu items={getItems(r)} />
        </CellActions>
      ),
      { id: "actions", minWidth: 72, ...opts },
    );
  },
  /** Escape hatch — free JSX but still with alignment/width meta. */
  custom<T>(header: ReactNode, render: (r: T) => ReactNode, opts?: ColOpts) {
    return base<T>("custom", header, render, opts);
  },
};
