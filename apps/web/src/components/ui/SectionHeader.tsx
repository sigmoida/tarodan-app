/** @format */

import Link from 'next/link';
import { Button } from '@tarodan/ui';

interface SectionHeaderProps {
	title: string;
	viewAllHref?: string;
	viewAllLabel?: string;
	badge?: React.ReactNode;
	className?: string;
}

export default function SectionHeader({
	title,
	viewAllHref,
	viewAllLabel = 'Tümünü gör',
	badge,
	className = '',
}: SectionHeaderProps) {
	return (
		<div className={`flex items-center justify-between gap-4 mb-4 ${className}`}>
			<div className='flex items-center gap-3 min-w-0'>
				<div className='w-1 h-6 bg-primary-500 flex-shrink-0 rounded-sm' />
				<h2 className='text-lg font-bold text-heading tracking-tight'>{title}</h2>
				{badge}
			</div>
			{viewAllHref && (
				<Button asChild variant='secondary' size='sm' className='flex-shrink-0'>
					<Link href={viewAllHref}>{viewAllLabel}</Link>
				</Button>
			)}
		</div>
	);
}
