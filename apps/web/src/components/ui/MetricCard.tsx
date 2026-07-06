/** @format */

import type { ComponentType, SVGProps } from 'react';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface MetricCardProps {
	icon: Icon;
	label: string;
	value: string | number;
	/** Text-color utility applied to the icon + value (e.g. `text-success-600`). */
	accent?: string;
}

/**
 * A single dashboard metric box: icon + label + prominent value. Shared across
 * profile list pages (discounts, offers, …) so the metric grid looks identical.
 */
export default function MetricCard({
	icon: Icon,
	label,
	value,
	accent = 'text-heading',
}: MetricCardProps) {
	return (
		<div className='rounded-lg border border-border bg-surface-elevated p-4'>
			<div className='mb-2 flex items-center gap-2'>
				<Icon className={`h-5 w-5 ${accent}`} />
				<p className='text-sm text-muted'>{label}</p>
			</div>
			<p className={`text-2xl font-bold ${accent}`}>{value}</p>
		</div>
	);
}
