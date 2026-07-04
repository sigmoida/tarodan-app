/** @format */

'use client';

import Image from 'next/image';
import { GlobeAltIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { countryToFlag } from '@/lib/countryFlag';
import { useTranslation } from '@/i18n';
import type { ManufacturerDetail } from '../../_lib/types';

export default function ManufacturerHero({
	brand,
}: {
	brand: ManufacturerDetail;
}) {
	const { t } = useTranslation();

	return (
		<div className='bg-surface-elevated rounded-2xl shadow-sm border border-border-subtle mb-12 relative overflow-hidden'>
			<div className='absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-primary-50 via-surface-elevated to-transparent rounded-full -translate-y-1/2 translate-x-1/2 opacity-60 pointer-events-none' />

			<div className='relative p-10 md:p-14 flex flex-col md:flex-row gap-12 items-center md:items-start text-center md:text-left'>
				{/* Logo */}
				<div className='w-40 h-40 bg-surface-elevated rounded-2xl shadow-lg border border-border-subtle flex items-center justify-center p-6 shrink-0 relative z-10'>
					{brand.logo ? (
						<Image
							src={brand.logo}
							alt={brand.name}
							fill
							unoptimized
							sizes='160px'
							className='object-contain p-6'
						/>
					) : (
						<span className='text-6xl font-black text-border-subtle uppercase'>
							{brand.name[0]}
						</span>
					)}
				</div>

				<div className='flex-1 relative z-10'>
					<div className='flex flex-wrap items-center gap-3 mb-4 justify-center md:justify-start'>
						{brand.country && (
							<span className='bg-surface-alt text-muted text-sm font-bold px-4 py-1.5 rounded-full border border-border flex items-center gap-2'>
								{countryToFlag(brand.country) || '🌍'} {brand.country}
							</span>
						)}
						{brand.foundedYear && (
							<span className='bg-surface-alt text-muted text-sm font-bold px-4 py-1.5 rounded-full border border-border flex items-center gap-2'>
								<CalendarIcon className='h-4 w-4' />
								{brand.foundedYear}
							</span>
						)}
					</div>

					<h1 className='text-5xl md:text-6xl font-black text-heading mb-6 tracking-tight leading-[0.9]'>
						{brand.name}
					</h1>

					{brand.description && (
						<p className='text-muted text-lg leading-relaxed max-w-3xl mb-8'>
							{brand.description}
						</p>
					)}

					<div className='flex flex-wrap gap-4 justify-center md:justify-start'>
						{brand.website && (
							<a
								href={brand.website}
								target='_blank'
								rel='noopener noreferrer'
								className='inline-flex items-center gap-2 px-6 py-3 bg-surface-elevated border border-border rounded-full text-body font-bold hover:bg-surface hover:text-primary-600 transition-colors shadow-sm'>
								<GlobeAltIcon className='h-5 w-5' />
								Web Sitesi
							</a>
						)}
						<div className='bg-primary-50 text-primary-700 font-bold px-6 py-3 rounded-full border border-primary-100 flex items-center gap-2'>
							<span className='w-2 h-2 bg-primary-500 rounded-full animate-pulse' />
							{brand.productCount} {t('brands.products') || 'Aktif İlan'}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
