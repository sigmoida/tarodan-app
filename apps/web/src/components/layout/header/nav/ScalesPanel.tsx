/** @format */

'use client';

import Link from 'next/link';
import { NavigationMenuLink } from '@tarodan/ui';

export default function ScalesPanel({
	title,
	scales,
}: {
	title: string;
	scales: string[];
}) {
	return (
		<div className='w-[92vw] max-w-md p-6 bg-surface-elevated border border-border rounded-lg shadow-elevated'>
			<h3 className='text-primary-500 font-bold text-sm mb-4 uppercase tracking-wide'>
				{title}
			</h3>
			<div className='flex flex-wrap gap-2.5'>
				{scales.map((scale) => (
					<NavigationMenuLink asChild key={scale}>
						<Link
							href={`/listings?scale=${encodeURIComponent(scale)}`}
							className='px-4 py-2 bg-surface border border-border hover:bg-primary-50 hover:border-primary-300 text-body hover:text-primary-600 text-sm font-medium transition-colors rounded-sm'>
							{scale}
						</Link>
					</NavigationMenuLink>
				))}
			</div>
		</div>
	);
}
