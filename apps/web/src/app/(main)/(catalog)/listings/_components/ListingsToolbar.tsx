/** @format */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Button, Select } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import { formatCondition } from '@/lib/format';
import ProductLayoutSelector from '@/components/ProductLayoutSelector';
import { useListings } from '../_context/ListingsContext';

/**
 * The page-header controls (rendered in the shared `PageHeader`'s actions slot):
 * the mobile "Filtreler" button, the product-layout selector and the sort Select.
 * The title + result count live in the PageHeader itself (see ListingsClient).
 */
export default function ListingsControls() {
	const { t, locale } = useTranslation();
	const {
		filters,
		productLayout,
		setProductLayout,
		activeFilterCount,
		setShowMobileSidebar,
		handleFiltersChange,
	} = useListings();

	return (
		<div className='flex items-center gap-2 overflow-x-auto'>
			<Button
				variant='secondary'
				onClick={() => setShowMobileSidebar(true)}
				className='lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-elevated border border-border rounded text-xs sm:text-sm font-medium hover:bg-surface transition-colors flex-shrink-0'>
				<FunnelIcon className='w-4 h-4' />
				<span className='hidden sm:inline'>{t('product.filters')}</span>
				{activeFilterCount > 0 && (
					<span className='px-1.5 py-0.5 bg-primary-500 text-inverted text-[10px] font-bold rounded-sm'>
						{activeFilterCount}
					</span>
				)}
			</Button>
			<ProductLayoutSelector
				layout={productLayout}
				onLayoutChange={setProductLayout}
				storageKey='listings-product-layout'
			/>
			<Select
				value={filters.sortBy}
				onChange={(e) =>
					handleFiltersChange({ ...filters, sortBy: e.target.value })
				}
				className='w-auto flex-shrink-0'>
				<option value='relevance'>
					{locale === 'en' ? 'Recommended' : 'Önerilen'}
				</option>
				<option value='created_desc'>{t('product.sortNewest')}</option>
				<option value='created_asc'>{t('product.sortOldest')}</option>
				<option value='view_count_desc'>{t('product.sortPopular')}</option>
				<option value='price_asc'>{t('product.sortPriceLow')}</option>
				<option value='price_desc'>{t('product.sortPriceHigh')}</option>
				<option value='rating_desc'>
					{locale === 'en' ? 'Highest Rating' : 'En yüksek puan'}
				</option>
				<option value='title_asc'>A-Z</option>
				<option value='title_desc'>Z-A</option>
			</Select>
		</div>
	);
}

/**
 * The active-filter chips row rendered above the grid (inside the content
 * column). Kept in the toolbar module since it's part of the filter toolbar UX.
 */
export function ActiveFilterChips() {
	const { t, locale } = useTranslation();
	const router = useRouter();
	const searchParams = useSearchParams();
	const {
		filters,
		filtersForSidebar,
		currentSearch,
		activeFilterCount,
		setFilters,
		setCurrentPage,
		handleFiltersChange,
		clearFilters,
	} = useListings();

	if (activeFilterCount === 0) return null;

	return (
		<div className='flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-border'>
			<span className='text-xs font-medium text-muted uppercase tracking-wide mr-1'>
				{locale === 'en' ? 'Filters' : 'Filtreler'}:
			</span>
			{currentSearch && (
				<span className='inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded border border-primary-200'>
					{locale === 'en' ? 'Search' : 'Arama'}: &quot;{currentSearch}&quot;
					<Button
						variant='secondary'
						onClick={() => {
							setFilters({ ...filters, search: '' });
							setCurrentPage(1);
							const params = new URLSearchParams(searchParams.toString());
							params.delete('search');
							params.delete('page');
							router.replace(
								params.toString()
									? `/listings?${params.toString()}`
									: '/listings',
							);
						}}
						className='hover:text-primary-900 ml-0.5'
						aria-label={locale === 'en' ? 'Remove search' : 'Aramayı kaldır'}>
						<XMarkIcon className='w-3.5 h-3.5' />
					</Button>
				</span>
			)}
			{[
				{ k: 'category', v: filtersForSidebar.category },
				{ k: 'brand', v: filters.brand },
				{ k: 'carModel', v: filters.carModel },
				{ k: 'scale', v: filters.scale },
				{ k: 'material', v: filters.material },
				{ k: 'condition', v: filters.condition },
				{ k: 'manufacturer', v: filters.manufacturer },
			].map(
				(f) =>
					f.v && (
						<span
							key={f.k}
							className='inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded border border-primary-200'>
							{f.k === 'condition'
								? formatCondition(f.v, locale)
								: f.k === 'material'
									? {
											diecast: 'Diecast (Metal)',
											resin: 'Resin (Reçine)',
											composite: 'Composite',
											plastic: 'Plastic',
										}[f.v] || f.v
									: f.k === 'vehicleType'
										? {
												araba: 'Arabalar',
												motosiklet: 'Motosikletler',
												motorsports: 'Motorsports',
												ticari: 'Ticari Araçlar',
												insaat: 'İnşaat Araçları',
												tarim: 'Tarım Araçları',
												askeri: 'Askeri Araçlar',
												'acil-durum': 'Acil Durum Araçları',
												gemi: 'Gemiler',
												tren: 'Trenler',
												ucak: 'Uçaklar',
												set: 'Setler',
											}[f.v] || f.v
										: f.v}
							<Button
								variant='secondary'
								onClick={() => {
									const updates: any = { ...filters, [f.k]: '' };
									if (f.k === 'manufacturer') updates.manufacturerId = '';
									if (f.k === 'brand') {
										updates.brandId = '';
										updates.carModelId = '';
										updates.carModel = '';
									}
									if (f.k === 'category') updates.categoryId = '';
									if (f.k === 'carModel') {
										updates.carModelId = '';
									}
									handleFiltersChange(updates);
								}}
								className='hover:text-primary-900 ml-0.5'>
								<XMarkIcon className='w-3.5 h-3.5' />
							</Button>
						</span>
					),
			)}
			{(filters.minPrice || filters.maxPrice) && (
				<span className='inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded border border-primary-200'>
					₺{filters.minPrice || '0'} - ₺{filters.maxPrice || '∞'}
					<Button
						variant='secondary'
						onClick={() =>
							handleFiltersChange({ ...filters, minPrice: '', maxPrice: '' })
						}
						className='hover:text-primary-900 ml-0.5'>
						<XMarkIcon className='w-3.5 h-3.5' />
					</Button>
				</span>
			)}
			{filters.tradeOnly && (
				<span className='inline-flex items-center gap-1 px-2.5 py-1 bg-success-50 text-success-700 text-xs font-medium rounded border border-success-200'>
					{t('product.tradeAvailable')}
					<Button
						variant='secondary'
						onClick={() => handleFiltersChange({ ...filters, tradeOnly: false })}
						className='hover:text-success-900 ml-0.5'>
						<XMarkIcon className='w-3.5 h-3.5' />
					</Button>
				</span>
			)}
			{filters.preOrder && (
				<span className='inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded border border-primary-200'>
					{t('product.preOrder')}
					<Button
						variant='secondary'
						onClick={() => handleFiltersChange({ ...filters, preOrder: false })}
						className='hover:text-primary-900 ml-0.5'>
						<XMarkIcon className='w-3.5 h-3.5' />
					</Button>
				</span>
			)}
			{filters.limited && (
				<span className='inline-flex items-center gap-1 px-2.5 py-1 bg-warning-50 text-warning-700 text-xs font-medium rounded border border-warning-200'>
					{t('product.limitedEdition')}
					<Button
						variant='secondary'
						onClick={() => handleFiltersChange({ ...filters, limited: false })}
						className='hover:text-warning-900 ml-0.5'>
						<XMarkIcon className='w-3.5 h-3.5' />
					</Button>
				</span>
			)}
			{filters.set && (
				<span className='inline-flex items-center gap-1 px-2.5 py-1 bg-info-50 text-info-700 text-xs font-medium rounded border border-info-200'>
					{t('product.sets')}
					<Button
						variant='secondary'
						onClick={() => handleFiltersChange({ ...filters, set: false })}
						className='hover:text-info-900 ml-0.5'>
						<XMarkIcon className='w-3.5 h-3.5' />
					</Button>
				</span>
			)}
			{filters.discountOnly && (
				<span className='inline-flex items-center gap-1 px-2.5 py-1 bg-danger-50 text-danger-700 text-xs font-medium rounded border border-danger-200'>
					{locale === 'en' ? 'On Sale' : 'İndirimli'}
					<Button
						variant='secondary'
						onClick={() =>
							handleFiltersChange({ ...filters, discountOnly: false })
						}
						className='hover:text-danger-900 ml-0.5'>
						<XMarkIcon className='w-3.5 h-3.5' />
					</Button>
				</span>
			)}
			<Button
				variant='secondary'
				onClick={clearFilters}
				className='text-xs text-primary-600 hover:text-primary-700 font-medium ml-1'>
				{t('product.clearFilters')}
			</Button>
		</div>
	);
}
