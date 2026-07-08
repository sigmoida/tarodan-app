/** @format */

import React from 'react';
import { cn } from '../lib/utils';

const SIZE = {
	sm: 'h-10 w-10',
	md: 'h-12 w-12',
	lg: 'h-14 w-14',
} as const;

export interface ThumbnailStackProps<T> {
	/** The full item list; only the first `max` render, the rest collapse to "+N". */
	items: T[];
	/** Renders the square image content for one item (fills the tile). */
	renderItem: (item: T, index: number) => React.ReactNode;
	/** Stable React key per item. Defaults to the index. */
	getKey?: (item: T, index: number) => React.Key;
	/** Max tiles before the "+N" overflow bubble. Default 4. */
	max?: number;
	/** Tile size — sm/md/lg. Default 'md'. */
	size?: keyof typeof SIZE;
	className?: string;
}

/**
 * Overlapping thumbnail row for "cart of N items" summaries (payments, orders).
 * Tiles overlap tightly and stack front-to-back; anything past `max` collapses
 * into a "+N" bubble. Image rendering is injected via `renderItem` so each app
 * uses its own optimized image (next/image, OptimizedImage, plain <img>…) — the
 * layout, ring, rounding and overflow bubble live here once.
 */
export function ThumbnailStack<T>({
	items,
	renderItem,
	getKey,
	max = 4,
	size = 'md',
	className,
}: ThumbnailStackProps<T>) {
	const shown = items.slice(0, max);
	const extra = items.length - shown.length;
	const tile = SIZE[size];

	return (
		<div className={cn('flex flex-shrink-0 items-center', className)}>
			{shown.map((item, i) => (
				<div
					key={getKey ? getKey(item, i) : i}
					className={cn(
						'relative flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt ring-2 ring-surface-elevated',
						tile,
						i > 0 && '-ml-4',
					)}
					style={{ zIndex: shown.length - i }}>
					{renderItem(item, i)}
				</div>
			))}
			{extra > 0 && (
				<div
					className={cn(
						'-ml-4 flex flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm font-semibold text-primary-600 ring-2 ring-surface-elevated',
						tile,
					)}>
					+{extra}
				</div>
			)}
		</div>
	);
}
