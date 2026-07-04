/** @format */

'use client';

import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { useListingDetail } from '../_context/ListingDetailContext';

export default function ProductBreadcrumbs() {
	const { t, listing } = useListingDetail();
	if (!listing) return null;

	return (
		<nav
			aria-label='Breadcrumb'
			className='flex items-center flex-wrap gap-y-1 text-sm text-muted mb-6 overflow-x-auto whitespace-nowrap pb-2'>
			<Link href='/' className='hover:text-primary-500 transition-colors text-muted'>
				{t('common.home')}
			</Link>
			<ChevronRightIcon
				className='w-4 h-4 mx-1 flex-shrink-0 text-subtle'
				aria-hidden
			/>
			<Link
				href='/listings'
				className='hover:text-primary-500 transition-colors text-muted'>
				{t('common.listings')}
			</Link>
			{listing.brand && (
				<>
					<ChevronRightIcon className='w-4 h-4 mx-2 flex-shrink-0' />
					<Link
						href={`/brands/${listing.brand.slug}`}
						className='hover:text-primary-500 transition-colors font-medium text-heading'>
						{listing.brand.name}
					</Link>
				</>
			)}
			{listing.carModel && (
				<>
					<ChevronRightIcon className='w-4 h-4 mx-2 flex-shrink-0' />
					<Link
						href={`/search?carModel=${listing.carModel.slug}`}
						className='hover:text-primary-500 transition-colors'>
						{listing.carModel.name}
					</Link>
				</>
			)}
			<ChevronRightIcon className='w-4 h-4 mx-2 flex-shrink-0' />
			<span className='text-subtle truncate max-w-[200px]'>{listing.title}</span>
		</nav>
	);
}
