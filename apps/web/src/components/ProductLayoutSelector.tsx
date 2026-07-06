/** @format */

'use client';

import { useEffect } from 'react';
import { Squares2X2Icon, Bars3Icon } from '@heroicons/react/24/outline';
import {
	Squares2X2Icon as GridIconSolid,
	Bars3Icon as ListIconSolid,
} from '@heroicons/react/24/solid';
import { Button } from '@tarodan/ui';

export type ProductLayout = 'grid' | 'list';

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;

const LAYOUTS: Array<{
	value: ProductLayout;
	Icon: IconType;
	IconActive: IconType;
	label: string;
}> = [
	{ value: 'grid', Icon: Squares2X2Icon, IconActive: GridIconSolid, label: 'Izgara' },
	{ value: 'list', Icon: Bars3Icon, IconActive: ListIconSolid, label: 'Liste' },
];

interface ProductLayoutSelectorProps {
	layout: ProductLayout;
	onLayoutChange: (layout: ProductLayout) => void;
	/** Optional localStorage key for persistence. */
	storageKey?: string;
}

/**
 * A segmented icon toggle for the product view: a responsive grid (up to 4
 * columns) or a horizontal list. Sized `h-10` to line up with the toolbar's
 * Select / Input controls. Stale persisted values (old 3/6-column modes) are
 * ignored on read and overwritten, so they harmlessly fall back to the grid.
 */
export default function ProductLayoutSelector({
	layout,
	onLayoutChange,
	storageKey,
}: ProductLayoutSelectorProps) {
	useEffect(() => {
		if (!storageKey) return;
		const saved = localStorage.getItem(storageKey) as ProductLayout | null;
		if (saved && LAYOUTS.some((l) => l.value === saved)) onLayoutChange(saved);
	}, [storageKey, onLayoutChange]);

	useEffect(() => {
		if (storageKey) localStorage.setItem(storageKey, layout);
	}, [layout, storageKey]);

	return (
		<div className='inline-flex h-10 flex-shrink-0 items-center gap-1 rounded-lg border border-border bg-surface-alt p-1'>
			{LAYOUTS.map(({ value, Icon, IconActive, label }) => {
				const active = layout === value;
				const Glyph = active ? IconActive : Icon;
				return (
					<Button
						variant='secondary'
						key={value}
						onClick={() => onLayoutChange(value)}
						title={label}
						aria-label={label}
						aria-pressed={active}
						className={`flex h-8 w-8 items-center justify-center rounded-md p-0 transition-colors ${
							active
								? 'bg-surface-elevated text-primary-500 shadow-sm'
								: 'text-muted hover:bg-surface hover:text-heading'
						}`}>
						<Glyph className='h-5 w-5' />
					</Button>
				);
			})}
		</div>
	);
}
