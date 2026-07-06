/** @format */

import type { ComponentType, SVGProps } from 'react';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface StatSummaryCardProps {
	title: string;
	value: string | number;
	icon: Icon;
	/** Text-color utility for the icon (e.g. `text-info-600`). */
	accent?: string;
	extraInfo?: { label: string; value: string | number }[];
}

/** A headline stat card with an optional breakdown grid (İlan/Sipariş/Takas). */
export default function StatSummaryCard({
	title,
	value,
	icon: Icon,
	accent = 'text-primary-600',
	extraInfo,
}: StatSummaryCardProps) {
	return (
		<div className='rounded-lg border border-border bg-surface-elevated p-6'>
			<div className='mb-4 flex items-center gap-4'>
				<div className='rounded-xl bg-surface p-3'>
					<Icon className={`h-6 w-6 ${accent}`} />
				</div>
				<div>
					<p className='text-sm text-muted'>{title}</p>
					<p className='text-3xl font-bold text-heading'>{value}</p>
				</div>
			</div>
			{extraInfo && (
				<div className='grid grid-cols-2 gap-3 border-t border-border-subtle pt-4'>
					{extraInfo.map((info) => (
						<div key={info.label} className='rounded-lg bg-surface p-2 text-center'>
							<p className='text-lg font-semibold text-heading'>{info.value}</p>
							<p className='text-xs text-muted'>{info.label}</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
