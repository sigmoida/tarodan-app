/** @format */

'use client';

import type { ReactNode } from 'react';
import { SectionHeader } from '@/components/ui';

/**
 * The single frame shared by every carded home section (the product rails and
 * the collections carousel): one consistent surface + border + padding, and one
 * header (title / view-all / badge) managed in one place. Sections only supply
 * their header text and content — no per-section background/class variations.
 */
export default function HomeSection({
	title,
	viewAllHref,
	viewAllLabel,
	badge,
	children,
}: {
	title: string;
	viewAllHref?: string;
	viewAllLabel?: string;
	badge?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className='py-4'>
			<div className='px-4'>
				<div className='bg-surface-elevated border border-border rounded p-3 md:p-5'>
					<SectionHeader
						title={title}
						viewAllHref={viewAllHref}
						viewAllLabel={viewAllLabel}
						badge={badge}
					/>
					{children}
				</div>
			</div>
		</section>
	);
}
