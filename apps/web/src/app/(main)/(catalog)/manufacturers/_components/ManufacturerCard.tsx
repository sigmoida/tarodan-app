/** @format */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ChevronRightIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { useManufacturers } from '../_context/ManufacturersContext';
import type { ManufacturerCard as ManufacturerCardData } from '../_lib/types';
import ManufacturerListingsPreview from './ManufacturerListingsPreview';

export default function ManufacturerCard({
	brand,
}: {
	brand: ManufacturerCardData;
}) {
	const { expandedBrand, toggleExpanded } = useManufacturers();
	const expanded = expandedBrand === brand.slug;

	return (
		<div
			className={`bg-surface-elevated border transition-all overflow-hidden rounded-md ${
				expanded
					? 'border-primary-300 shadow-md'
					: 'border-border hover:border-primary-200 hover:shadow-sm'
			}`}>
			{/* Header — always visible */}
			<Button
				variant='secondary'
				onClick={() => toggleExpanded(brand.slug)}
				className='w-full text-left p-4 sm:p-5 flex items-center gap-4 sm:gap-5 bg-transparent hover:bg-surface border-0 rounded-none'>
				<div className='w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 bg-surface border border-border-subtle flex items-center justify-center p-2 relative rounded-md'>
					{brand.logoUrl ? (
						<Image
							src={brand.logoUrl}
							alt={brand.name}
							fill
							className='object-contain p-1'
							sizes='80px'
							unoptimized
						/>
					) : (
						<span className='text-xl font-bold text-subtle'>
							{brand.name.charAt(0)}
						</span>
					)}
				</div>
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2 mb-1'>
						<h2 className='text-lg sm:text-xl font-bold text-heading truncate'>
							{brand.name}
						</h2>
						<span className='text-sm'>{brand.countryFlag}</span>
					</div>
					<p className='text-sm text-muted line-clamp-1'>{brand.description}</p>
					{brand.founded > 0 && (
						<div className='flex items-center gap-4 mt-2 text-xs text-subtle'>
							<span className='flex items-center gap-1'>
								<CalendarIcon className='w-3.5 h-3.5' />
								{brand.founded}
							</span>
						</div>
					)}
				</div>
				<ChevronRightIcon
					className={`w-5 h-5 text-subtle flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
				/>
			</Button>

			{/* Expanded content */}
			{expanded && (
				<div className='px-4 sm:px-5 pb-5 border-t border-border-subtle pt-4 space-y-4'>
					<ManufacturerListingsPreview manufacturerId={brand.id} />

					<div className='flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border-subtle'>
						<div className='flex flex-wrap items-center gap-3'>
							{(brand.founded > 0 || brand.country) && (
								<div className='flex items-center gap-2 bg-surface px-3 py-1.5 text-xs rounded'>
									<span className='font-bold text-heading'>Kuruluş:</span>
									<span className='text-muted'>
										{[brand.founded > 0 ? brand.founded : null, brand.country]
											.filter(Boolean)
											.join(', ')}
									</span>
								</div>
							)}
							<div className='flex items-center gap-2 bg-surface px-3 py-1.5 text-xs rounded'>
								<span className='font-bold text-heading'>Aktif İlan:</span>
								<span className='text-primary-600 font-semibold'>
									{brand.productCount ?? 0}
								</span>
							</div>
							{brand.website && (
								<a
									href={brand.website}
									target='_blank'
									rel='noopener noreferrer'
									className='flex items-center gap-1.5 bg-surface px-3 py-1.5 text-xs text-info-600 hover:text-info-800 transition-colors rounded'>
									<span className='font-bold'>Web Sitesi</span>
									<ChevronRightIcon className='w-3.5 h-3.5' />
								</a>
							)}
						</div>
						<Link
							href={`/listings?manufacturer=${encodeURIComponent(brand.name)}`}
							className='inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors'>
							Tüm {brand.name} ilanları
							<ChevronRightIcon className='w-3.5 h-3.5' />
						</Link>
					</div>
				</div>
			)}
		</div>
	);
}
