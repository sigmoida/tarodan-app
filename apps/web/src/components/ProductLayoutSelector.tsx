/** @format */

'use client';

import { useEffect } from 'react';
import {
	Squares2X2Icon,
	Bars3Icon,
	ViewColumnsIcon,
	RectangleGroupIcon,
} from '@heroicons/react/24/outline';
import {
	Squares2X2Icon as GridIconSolid,
	Bars3Icon as ListIconSolid,
	ViewColumnsIcon as ViewColumnsIconSolid,
	RectangleGroupIcon as RectangleGroupIconSolid,
} from '@heroicons/react/24/solid';
import { Button } from '@tarodan/ui';

export type ProductLayout = 'grid-3' | 'grid-4' | 'grid-6' | 'list';

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;

const LAYOUTS: Array<{
	value: ProductLayout;
	Icon: IconType;
	IconActive: IconType;
	label: string;
}> = [
	{ value: 'grid-3', Icon: RectangleGroupIcon, IconActive: RectangleGroupIconSolid, label: "3'lü" },
	{ value: 'grid-4', Icon: Squares2X2Icon, IconActive: GridIconSolid, label: "4'lü" },
	{ value: 'grid-6', Icon: ViewColumnsIcon, IconActive: ViewColumnsIconSolid, label: "6'şarlı" },
	{ value: 'list', Icon: Bars3Icon, IconActive: ListIconSolid, label: 'Liste' },
];

interface ProductLayoutSelectorProps {
	layout: ProductLayout;
	onLayoutChange: (layout: ProductLayout) => void;
	/** Optional localStorage key for persistence. */
	storageKey?: string;
}

/**
 * A segmented icon toggle for the product grid density (3 / 4 / 6 columns or
 * list). Sized `h-10` to line up with the toolbar's Select / Input controls.
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
