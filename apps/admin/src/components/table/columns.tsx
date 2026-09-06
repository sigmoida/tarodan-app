/** @format */

import { type ColumnDef } from "@tanstack/react-table";
import { type ReactNode } from "react";
import { type CellColumnMeta, type SortType } from "./meta";
import {
  CellActions,
  CellBadge,
  CellCode,
  CellDate,
  CellId,
  CellLink,
  CellMoney,
  CellMuted,
  CellNumber,
  CellProduct,
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

/** Coerce a cell value to a CSV-safe scalar; dates → ISO, non-primitives → empty. */
const toText = (v: unknown): string | number =>
  v == null
    ? ""
    : v instanceof Date
      ? v.toISOString()
      : typeof v === "number" || typeof v === "string"
        ? v
        : "";

/**
 * An accessor is either a plain field key (string) or a getter function.
 * The string form auto-builds the getter AND opts the column into sorting:
 * `meta.sortKey`/`sortable`/`sortType` are filled from the producer type.
 *
 * Sorting is ON BY DEFAULT for every non-action column — the ONLY way a column
 * ends up non-sortable is `col.actions`/`col.rowMenu` (never sortable) or an
 * explicit `{ sortable: false }`. Because the function form has no field to
 * derive from, a function-accessor column MUST carry an explicit `sortKey`
 * (scalar field → `"createdAt"`; relation/computed → dotted `"seller.displayName"`
 * matching the backend `sortMap`). Unknown keys fall back safely server-side.
 */
type Accessor<T, V> = string | ((r: T) => V);

// Cell producer → default client comparator family (see meta.ts SortType).
const SORT_TYPE: Partial<Record<keyof typeof DEFAULTS, SortType>> = {
  text: "text",
  muted: "text",
  code: "text",
  link: "text",
  user: "text",
  product: "text",
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
  const get: (r: T) => V =
    typeof accessor === "string"
      ? (r) => (r as Record<string, unknown>)[accessor] as V
      : accessor;
  // Default CSV export = the scalar value; callers can still override with their
  // own `exportValue` (it wins via the `...opts` spread).
  const resolved: ColOpts = {
    ...(typeof accessor === "string" ? { sortKey: accessor } : {}),
    exportValue: (r) => toText(get(r as T)),
    ...opts,
  };
  return [get, resolved];
}

// minWidth is the column's base width and, for flexible columns, its proportional
// growth weight. Fixed columns stay at minWidth while flexible columns share the
// remaining table space. `grow` is retained only for backward compatibility.
const DEFAULTS = {
  text: { grow: 3, minWidth: 180, align: "left" },
  muted: { grow: 2, minWidth: 180, align: "left" },
  money: { grow: 1, minWidth: 120, align: "left" },
  number: { grow: 1, minWidth: 100, align: "left" },
  date: { grow: 1, minWidth: 140, align: "left" },
  code: { grow: 2, minWidth: 140, align: "left" },
  link: { grow: 3, minWidth: 180, align: "left" },
  user: { grow: 4, minWidth: 280, align: "left" },
  product: { grow: 4, minWidth: 300, align: "left" },
  badge: { grow: 1, minWidth: 160, align: "left" },
  actions: { grow: 1, minWidth: 96, align: "right" },
  custom: { grow: 2, minWidth: 180, align: "left" },
} as const;

function base<T>(
  type: keyof typeof DEFAULTS,
  header: ReactNode,
  cell: (row: T) => ReactNode,
  opts: ColOpts = {},
): ColumnDef<T, unknown> {
  const d = DEFAULTS[type];
  const id = opts.id ?? (typeof header === "string" && header ? header : type);
  // Sort is ON BY DEFAULT: any non-action column that carries a `sortKey`
  // (string-accessor form auto-adds it; function form passes it explicitly) is
  // sortable unless the caller opts out with `sortable: false`. `actions`/
  // `rowMenu` (type "actions") are never sortable.
  const sortKey = opts.sortKey;
  const sortable =
    type !== "actions" && sortKey != null && opts.sortable !== false;
  const sortType = sortable ? (opts.sortType ?? SORT_TYPE[type]) : undefined;
  // Header-aware min-width: a column is never narrower than its header. When the
  // header (a string) needs more room than the configured `minWidth`, we widen
  // to fit it (≈8px/char at text-sm semibold + cell padding + sort-arrow room);
  // otherwise the configured `minWidth` wins. This keeps headers from clipping.
  const configuredMin = opts.minWidth ?? d.minWidth;
  const headerMin =
    typeof header === "string" && header
      ? Math.ceil(header.length * 8) + (sortable ? 56 : 40)
      : 0;
  return {
    id,
    header: () => header,
    cell: ({ row }: { row: Row<T> }) => cell(row.original),
    meta: {
      align: opts.align ?? d.align,
      minWidth: Math.max(configuredMin, headerMin),
      fixed: opts.fixed,
      grow: opts.grow ?? d.grow,
      exportHeader: typeof header === "string" ? header : undefined,
      exportValue: opts.exportValue,
      ...(sortable ? { sortKey, sortable, sortType } : {}),
    },
  };
}

export const col = {
  /**
   * Free text (truncate + hover). Pass a field key to make it sortable.
   * `wrap: true` kırpma yerine satır kaydırır — uzun etiketler için.
   */
  text<T>(
    header: ReactNode,
    get: Accessor<T, ReactNode>,
    opts?: ColOpts & { wrap?: boolean },
  ) {
    const [g, o] = field(get, opts);
    return base<T>(
      "text",
      header,
      (r) => <CellText value={g(r)} wrap={opts?.wrap} />,
      o,
    );
  },
  /** Secondary/muted text. Pass a field key to make it sortable. */
  muted<T>(header: ReactNode, get: Accessor<T, ReactNode>, opts?: ColOpts) {
    const [g, o] = field(get, opts);
    return base<T>("muted", header, (r) => <CellMuted value={g(r)} />, o);
  },
  /** Money (₺, tabular-nums). `tone` only changes the color. */
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
  /** Plain number (tabular-nums). Pass a field key to make it sortable. */
  number<T>(
    header: ReactNode,
    get: Accessor<T, number | string | null | undefined>,
    opts?: ColOpts,
  ) {
    const [g, o] = field(get, opts);
    return base<T>("number", header, (r) => <CellNumber value={g(r)} />, o);
  },
  /**
   * Short date (full time on hover). Pass a field key to make it sortable.
   * `withTime: true` prints the clock next to the date (muted) — for tables
   * where the hour is part of the reading, not just tooltip detail.
   */
  date<T>(
    header: ReactNode,
    get: Accessor<T, string | number | Date | null | undefined>,
    opts?: ColOpts & { withTime?: boolean },
  ) {
    const [g, o] = field(get, opts);
    return base<T>(
      "date",
      header,
      (r) => <CellDate value={g(r)} withTime={opts?.withTime} />,
      o,
    );
  },
  /** ID / tracking no (mono, clipped). Pass a field key to make it sortable. */
  code<T>(header: ReactNode, get: Accessor<T, ReactNode>, opts?: ColOpts) {
    const [g, o] = field(get, opts);
    return base<T>("code", header, (r) => <CellCode value={g(r)} />, o);
  },
  /** Opaque id (cuid) — compact copyable form. Narrow column; full id on hover/copy. */
  id<T>(
    header: ReactNode,
    get: Accessor<T, string | null | undefined>,
    opts?: ColOpts,
  ) {
    const [g, o] = field(get, opts);
    return base<T>("code", header, (r) => <CellId value={g(r)} />, {
      minWidth: 120,
      sortable: false,
      ...o,
    });
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
      { exportValue: (r) => toText(get(r as T)?.label), ...opts },
    );
  },
  /** Person/entity (name + optional sub-line). */
  user<T>(
    header: ReactNode,
    get: (r: T) =>
      | {
          name?: ReactNode;
          secondary?: ReactNode;
          tertiary?: ReactNode;
          avatar?: string | null;
          href?: string | null;
        }
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
          <CellUser
            name={v?.name}
            secondary={v?.secondary}
            tertiary={v?.tertiary}
            avatar={v?.avatar}
            href={v?.href}
          />
        );
      },
      { exportValue: (r) => toText(get(r as T)?.name), ...opts },
    );
  },
  /** Product (thumbnail + title + optional supporting lines). */
  product<T>(
    header: ReactNode,
    get: (r: T) =>
      | {
          title?: ReactNode;
          secondary?: ReactNode;
          tertiary?: ReactNode;
          image?: string | null;
          imageCount?: number | null;
          href?: string | null;
        }
      | null
      | undefined,
    opts?: ColOpts,
  ) {
    return base<T>(
      "product",
      header,
      (r) => {
        const v = get(r);
        return (
          <CellProduct
            title={v?.title}
            secondary={v?.secondary}
            tertiary={v?.tertiary}
            image={v?.image}
            imageCount={v?.imageCount}
            href={v?.href}
          />
        );
      },
      { exportValue: (r) => toText(get(r as T)?.title), ...opts },
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
        fixed: true,
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
      { id: "actions", minWidth: 72, fixed: true, ...opts },
    );
  },
  /** Escape hatch — free JSX but still with alignment/width meta. */
  custom<T>(header: ReactNode, render: (r: T) => ReactNode, opts?: ColOpts) {
    return base<T>("custom", header, render, opts);
  },
};
