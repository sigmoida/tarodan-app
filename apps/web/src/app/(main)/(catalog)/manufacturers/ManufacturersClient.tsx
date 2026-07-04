/** @format */

'use client';

import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import {
	ManufacturersProvider,
	useManufacturers,
} from './_context/ManufacturersContext';
import ManufacturersToolbar from './_components/ManufacturersToolbar';
import ManufacturerCard from './_components/ManufacturerCard';
import DiecastTimeline from './_components/DiecastTimeline';

function ManufacturersLayout() {
	const {
		isAuthenticated,
		searchQuery,
		clearFilters,
		brands,
		filteredBrands,
		countries,
		totalProducts,
	} = useManufacturers();

	const stats = [
		{ value: brands.length.toString(), label: 'Üretici' },
		{ value: countries.length.toString(), label: 'Ülke' },
		{ value: '70+', label: 'Yıllık Tarih' },
		{ value: `${totalProducts.toLocaleString('tr-TR')}+`, label: 'Model' },
	];

	return (
		<PageShell className='pb-20'>
			{/* Hero */}
			<div className='relative bg-gradient-to-br from-primary-50 via-surface-elevated to-warning-50/50 overflow-hidden border-b border-border'>
				<div className='max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 relative z-10'>
					<div className='text-center'>
						<div className='inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-xs font-bold uppercase tracking-widest px-4 py-1.5 mb-5 rounded'>
							{brands.length} Üretici &middot;{' '}
							{totalProducts.toLocaleString('tr-TR')}+ Ürün
						</div>
						<h1 className='text-4xl sm:text-5xl font-black text-heading mb-4 tracking-tight'>
							Diecast Üreticiler Rehberi
						</h1>
						<p className='text-muted max-w-2xl mx-auto text-base sm:text-lg leading-relaxed'>
							Dünyanın en prestijli diecast model araba üreticilerini keşfedin. Her
							markanın tarihini, özel serilerini ve popüler modellerini inceleyin.
						</p>
					</div>

					<div className='flex justify-center gap-8 sm:gap-14 mt-10'>
						{stats.map((stat) => (
							<div key={stat.label} className='text-center'>
								<p className='text-2xl sm:text-3xl font-black text-heading'>
									{stat.value}
								</p>
								<p className='text-xs text-muted mt-1 uppercase tracking-wider font-medium'>
									{stat.label}
								</p>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Filters */}
			<div className='bg-surface-elevated border-b border-border shadow-sm'>
				<div className='max-w-7xl mx-auto px-4 sm:px-6 py-3'>
					<ManufacturersToolbar />
				</div>
			</div>

			{/* Brand cards */}
			<div className='max-w-7xl mx-auto px-4 sm:px-6 mt-8'>
				{filteredBrands.length === 0 ? (
					<div className='text-center py-20'>
						<div className='inline-flex items-center justify-center w-16 h-16 bg-surface-alt mb-4 rounded'>
							<MagnifyingGlassIcon className='w-8 h-8 text-subtle' />
						</div>
						<h3 className='text-lg font-bold text-heading mb-1'>
							Sonuç Bulunamadı
						</h3>
						<p className='text-sm text-muted mb-4'>
							&quot;{searchQuery}&quot; aramasıyla eşleşen üretici yok.
						</p>
						<Button
							variant='secondary'
							onClick={clearFilters}
							className='px-5 py-2 bg-heading text-inverted text-sm font-semibold hover:bg-primary-600 transition-colors rounded'>
							Filtreleri Temizle
						</Button>
					</div>
				) : (
					<div className='space-y-4'>
						{filteredBrands.map((brand) => (
							<ManufacturerCard key={brand.slug} brand={brand} />
						))}
					</div>
				)}
			</div>

			{/* Timeline */}
			<div className='max-w-7xl mx-auto px-4 sm:px-6 mt-14'>
				<DiecastTimeline />
			</div>

			{/* CTA — only for logged-out visitors */}
			{!isAuthenticated && (
				<div className='max-w-7xl mx-auto px-4 sm:px-6 mt-8'>
					<div className='bg-primary-50 border border-primary-100 p-6 sm:p-10 text-center relative overflow-hidden rounded-md'>
						<div className='relative z-10'>
							<h2 className='text-2xl sm:text-3xl font-black text-heading mb-3'>
								Koleksiyonunuzu Başlatın
							</h2>
							<p className='text-muted mb-6 max-w-lg mx-auto text-sm sm:text-base'>
								Favori markalarınızdan binlerce diecast model arasından seçim yapın.
								Hemen üye olun ve koleksiyonunuzu oluşturmaya başlayın.
							</p>
							<div className='flex items-center justify-center gap-3'>
								<Link
									href='/listings'
									className='px-6 py-2.5 bg-primary-500 text-inverted text-sm font-bold hover:bg-primary-600 transition-colors rounded'>
									İlanları Keşfet
								</Link>
								<Link
									href='/register'
									className='px-6 py-2.5 bg-surface-elevated text-body text-sm font-bold hover:bg-surface transition-colors border border-border rounded'>
									Üye Ol
								</Link>
							</div>
						</div>
					</div>
				</div>
			)}
		</PageShell>
	);
}

export default function ManufacturersClient() {
	return (
		<ManufacturersProvider>
			<ManufacturersLayout />
		</ManufacturersProvider>
	);
}
