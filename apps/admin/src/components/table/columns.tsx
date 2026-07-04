/** @format */

import { type ColumnDef } from '@tanstack/react-table';
import { type ReactNode } from 'react';
import { type CellColumnMeta } from './meta';
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
} from './cells';
import { RowActionMenu, type RowActionItem } from './RowActionMenu';

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

// minWidth = the column's base px width: both its share of the horizontal-scroll
// threshold (Σ minWidth) and its proportional growth weight on wide screens. `grow`
// NO LONGER affects width (the table is driven by `<table>` min-width + `table-fixed`);
// we keep the field for backward compatibility. To widen/narrow a column, set
// `minWidth`.
const DEFAULTS = {
	text: { grow: 3, minWidth: 160, align: 'left' },
	muted: { grow: 2, minWidth: 140, align: 'left' },
	money: { grow: 1, minWidth: 120, align: 'right' },
	number: { grow: 1, minWidth: 100, align: 'right' },
	date: { grow: 1, minWidth: 120, align: 'left' },
	code: { grow: 2, minWidth: 140, align: 'left' },
	link: { grow: 3, minWidth: 150, align: 'left' },
	user: { grow: 4, minWidth: 190, align: 'left' },
	badge: { grow: 1, minWidth: 160, align: 'left' },
	actions: { grow: 1, minWidth: 120, align: 'right' },
	custom: { grow: 2, minWidth: 160, align: 'left' },
} as const;

function base<T>(
	type: keyof typeof DEFAULTS,
	header: ReactNode,
	cell: (row: T) => ReactNode,
	opts: ColOpts = {},
): ColumnDef<T, unknown> {
	const d = DEFAULTS[type];
	const id = opts.id ?? (typeof header === 'string' && header ? header : type);
	return {
		id,
		header: () => header,
		cell: ({ row }: { row: Row<T> }) => cell(row.original),
		meta: {
			align: opts.align ?? d.align,
			minWidth: opts.minWidth ?? d.minWidth,
			grow: opts.grow ?? d.grow,
		},
	};
}

export const col = {
	/** Free text (truncate + hover). */
	text<T>(header: ReactNode, get: (r: T) => ReactNode, opts?: ColOpts) {
		return base<T>('text', header, (r) => <CellText value={get(r)} />, opts);
	},
	/** Secondary/muted text. */
	muted<T>(header: ReactNode, get: (r: T) => ReactNode, opts?: ColOpts) {
		return base<T>('muted', header, (r) => <CellMuted value={get(r)} />, opts);
	},
	/** Money (₺, right, tabular-nums). `tone` only changes the color. */
	money<T>(
		header: ReactNode,
		get: (r: T) => number | string | null | undefined,
		opts?: ColOpts & { tone?: MoneyTone },
	) {
		return base<T>(
			'money',
			header,
			(r) => (
				<CellMoney
					value={get(r)}
					tone={opts?.tone}
				/>
			),
			opts,
		);
	},
	/** Plain number (right, tabular-nums). */
	number<T>(
		header: ReactNode,
		get: (r: T) => number | string | null | undefined,
		opts?: ColOpts,
	) {
		return base<T>(
			'number',
			header,
			(r) => <CellNumber value={get(r)} />,
			opts,
		);
	},
	/** Short date (full time on hover). */
	date<T>(
		header: ReactNode,
		get: (r: T) => string | number | Date | null | undefined,
		opts?: ColOpts,
	) {
		return base<T>('date', header, (r) => <CellDate value={get(r)} />, opts);
	},
	/** ID / tracking no (mono, clipped). */
	code<T>(header: ReactNode, get: (r: T) => ReactNode, opts?: ColOpts) {
		return base<T>('code', header, (r) => <CellCode value={get(r)} />, opts);
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
			'link',
			header,
			(r) => {
				const v = get(r);
				return (
					<CellLink
						href={v?.href}
						label={v?.label}
					/>
				);
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
			'user',
			header,
			(r) => {
				const v = get(r);
				return (
					<CellUser
						name={v?.name}
						secondary={v?.secondary}
						href={v?.href}
					/>
				);
			},
			opts,
		);
	},
	/** Badge (no wrap). `render` returns the badge JSX. */
	badge<T>(header: ReactNode, render: (r: T) => ReactNode, opts?: ColOpts) {
		return base<T>(
			'badge',
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
			'actions',
			opts?.header ?? '',
			(r) => <CellActions>{render(r)}</CellActions>,
			{
				id: 'actions',
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
			'actions',
			opts?.header ?? '',
			(r) => (
				<CellActions>
					<RowActionMenu items={getItems(r)} />
				</CellActions>
			),
			{ id: 'actions', minWidth: 72, ...opts },
		);
	},
	/** Escape hatch — free JSX but still with alignment/width meta. */
	custom<T>(header: ReactNode, render: (r: T) => ReactNode, opts?: ColOpts) {
		return base<T>('custom', header, render, opts);
	},
};
