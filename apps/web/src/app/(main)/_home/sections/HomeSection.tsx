/** @format */

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';

/**
 * The home-page section wrapper: the standard `py-4 px-4` rhythm around a shared
 * `SectionCard`. Sections supply their header text and content; the optional
 * "view all" link is mapped onto SectionCard's generic `action` slot.
 */
export default function HomeSection({
	title,
	viewAllHref,
	viewAllLabel = 'Tümünü gör',
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
				<SectionCard
					title={title}
					badge={badge}
					action={
						viewAllHref ? (
							<Button asChild variant='secondary' size='sm'>
								<Link
									href={viewAllHref}
									className='inline-flex items-center gap-1'>
									{viewAllLabel}
									<ChevronRightIcon className='w-4 h-4' />
								</Link>
							</Button>
						) : undefined
					}>
					{children}
				</SectionCard>
			</div>
		</section>
	);
}
