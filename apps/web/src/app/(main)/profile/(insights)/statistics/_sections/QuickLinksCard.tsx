/** @format */

import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import {
	FireIcon,
	TagIcon,
	ShoppingBagIcon,
	ArrowsRightLeftIcon,
	RectangleStackIcon,
} from '@heroicons/react/24/outline';
import SectionCard from '@/components/ui/SectionCard';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const LINKS: { href: string; label: string; icon: Icon }[] = [
	{ href: '/profile/listings', label: 'İlanlarım', icon: TagIcon },
	{ href: '/profile/orders', label: 'Siparişlerim', icon: ShoppingBagIcon },
	{ href: '/profile/trades', label: 'Takaslarım', icon: ArrowsRightLeftIcon },
	{ href: '/collections', label: 'Koleksiyonlarım', icon: RectangleStackIcon },
];

export default function QuickLinksCard() {
	return (
		<SectionCard
			title='Hızlı Erişim'
			badge={<FireIcon className='h-5 w-5 text-primary-500' />}>
			<div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
				{LINKS.map(({ href, label, icon: Icon }) => (
					<Link
						key={href}
						href={href}
						className='group flex items-center gap-3 rounded-lg border border-transparent bg-surface p-4 transition-all hover:border-primary-200 hover:bg-primary-50'>
						<Icon className='h-5 w-5 text-muted group-hover:text-primary-500' />
						<span className='text-sm font-medium text-body group-hover:text-primary-600'>
							{label}
						</span>
					</Link>
				))}
			</div>
		</SectionCard>
	);
}
