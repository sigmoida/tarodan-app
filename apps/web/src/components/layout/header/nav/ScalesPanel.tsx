/** @format */

'use client';

import Link from 'next/link';
import { NavigationMenuLink } from '@tarodan/ui';
import NavPanel from './NavPanel';

export default function ScalesPanel({
	title,
	scales,
}: {
	title: string;
	scales: string[];
}) {
	return (
		<NavPanel>
			<h3 className='text-primary-500 font-bold text-base mb-4 tracking-wide'>
				{title}
			</h3>
			<div className='flex flex-wrap gap-2.5'>
				{scales.map((scale) => (
					<NavigationMenuLink
						asChild
						key={scale}>
						<Link
							href={`/listings?scale=${encodeURIComponent(scale)}`}
							className='px-4 py-2 bg-surface border border-border hover:bg-primary-50 hover:border-primary-300 text-body hover:text-primary-600 text-sm font-medium transition-colors rounded-lg'>
							{scale}
						</Link>
					</NavigationMenuLink>
				))}
			</div>
		</NavPanel>
	);
}
