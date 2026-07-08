/** @format */

import type { ComponentType, SVGProps } from 'react';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface MetricCardProps {
	/** Optional leading icon. When omitted the card centers value-over-label. */
	icon?: Icon;
	label: string;
	value: string | number;
	/** Text-color utility applied to the icon + value (e.g. `text-success-600`). */
	accent?: string;
	/** Force centered value-over-label layout. Defaults to true when there's no icon. */
	centered?: boolean;
}

/**
 * A single dashboard metric box: prominent value + label (+ optional leading
 * icon). Shared across profile list pages (discounts, offers, …) AND the catalog
 * (manufacturers stats) so every metric grid looks identical. With an icon it's
 * the icon+label row over the value; without one it centers the value over an
 * uppercase label.
 */
export default function MetricCard({
	icon: Icon,
	label,
	value,
	accent = 'text-heading',
	centered,
}: MetricCardProps) {
	const center = centered ?? !Icon;

	return (
		<div
			className={`rounded-lg border border-border bg-surface-elevated p-4${
				center ? ' text-center' : ''
			}`}>
			{Icon ? (
				<div className='mb-2 flex items-center gap-2'>
					<Icon className={`h-5 w-5 ${accent}`} />
					<p className='text-sm text-muted'>{label}</p>
				</div>
			) : null}
			<p className={`text-2xl font-bold ${accent}`}>{value}</p>
			{!Icon ? (
				<p className='mt-1 text-xs font-medium uppercase tracking-wider text-muted'>
					{label}
				</p>
			) : null}
		</div>
	);
}
