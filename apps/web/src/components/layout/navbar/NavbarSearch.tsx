/** @format */

'use client';

import Link from 'next/link';
import {
	MagnifyingGlassIcon,
	XMarkIcon,
	ClockIcon,
	FireIcon,
	ArrowRightIcon,
	ShoppingBagIcon,
	TagIcon,
} from '@heroicons/react/24/outline';
import { Button, Input, Spinner } from '@tarodan/ui';
import { useTranslation } from '@/i18n/LanguageContext';
import { isValidImageSrc } from '@/components/OptimizedImage';
import { useNavSearch } from './hooks/useNavSearch';

const POPULAR_SEARCHES = {
	tr: [
		'Hot Wheels',
		'Matchbox',
		'Minichamps',
		'1:18 ölçek',
		'Ferrari',
		'Porsche',
	],
	en: [
		'Hot Wheels',
		'Matchbox',
		'Minichamps',
		'1:18 scale',
		'Ferrari',
		'Porsche',
	],
};

/**
 * Desktop search form + the full autocomplete dropdown (recent + popular +
 * rich categorized results). All state/logic lives in `useNavSearch`.
 */
export default function NavbarSearch() {
	const { t, locale } = useTranslation();
	const {
		searchContainerRef,
		searchInputRef,
		searchQuery,
		setSearchQuery,
		setDebouncedQuery,
		debouncedQuery,
		showSearchDropdown,
		setShowSearchDropdown,
		activeIndex,
		recentSearches,
		clearSearches,
		removeSearch,
		handleSearchSubmit,
		handleSearchKeyDown,
		navigateSearch,
		autoResults,
		isAutocompleteLoading,
		flatItems,
	} = useNavSearch();

	return (
		<div
			ref={searchContainerRef}
			className='hidden md:flex flex-1 justify-center min-w-0 min-h-0 px-4'>
			<div className='w-full max-w-xl relative flex-shrink-0'>
				<form
					onSubmit={handleSearchSubmit}
					className='relative h-10 block'>
					<span className='absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center flex-shrink-0 pointer-events-none text-primary-400'>
						<MagnifyingGlassIcon
							className='w-4 h-4 shrink-0'
							aria-hidden
						/>
					</span>
					<Input
						ref={searchInputRef}
						type='text'
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onFocus={() => setShowSearchDropdown(true)}
						onKeyDown={handleSearchKeyDown}
						placeholder={t('nav.searchPlaceholder')}
						className='w-full h-10 pl-10 pr-10'
						aria-label={t('nav.searchPlaceholder')}
						autoComplete='off'
					/>
					{searchQuery && (
						<Button
							variant='secondary'
							type='button'
							onClick={() => {
								setSearchQuery('');
								setDebouncedQuery('');
								searchInputRef.current?.focus();
							}}
							className='absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-muted'>
							<XMarkIcon className='w-4 h-4' />
						</Button>
					)}
				</form>

				{/* Search Dropdown */}
				{showSearchDropdown && (
					<div className='absolute left-0 right-0 mt-1 bg-surface-elevated rounded-lg shadow-2xl border border-border z-[100] overflow-hidden'>
						{/* === STATE 1: Empty / Focus — Recent searches + Popular === */}
						{debouncedQuery.length < 2 ? (
							<div className='max-h-[420px] overflow-y-auto'>
								{/* Son Aramalar */}
								{recentSearches.length > 0 && (
									<div className='px-4 pt-3 pb-2'>
										<div className='flex items-center justify-between mb-2'>
											<span className='text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5'>
												<ClockIcon className='w-3.5 h-3.5 shrink-0' />
												{locale === 'en' ? 'Recent Searches' : 'Son Aramalar'}
											</span>
											<Button
												variant='secondary'
												type='button'
												onClick={clearSearches}
												className='text-xs text-primary-500 hover:text-primary-600 font-medium'>
												{locale === 'en' ? 'Clear' : 'Temizle'}
											</Button>
										</div>
										<div className='space-y-0.5'>
											{recentSearches.map((s, idx) => (
												<div
													key={s}
													className='flex items-center justify-between gap-1 group'>
													<Button
														variant='secondary'
														type='button'
														onClick={() => navigateSearch(s)}
														className={`flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${activeIndex === idx ? 'bg-primary-50 text-primary-600' : 'text-body hover:bg-primary-50 hover:text-primary-600'}`}>
														<ClockIcon className='w-4 h-4 text-subtle shrink-0' />
														<span className='truncate'>{s}</span>
													</Button>
													<Button
														variant='secondary'
														type='button'
														onClick={(e) => {
															e.stopPropagation();
															removeSearch(s);
														}}
														className='p-1.5 shrink-0 text-subtle hover:text-danger-500 rounded transition-opacity opacity-0 group-hover:opacity-100'
														aria-label={locale === 'en' ? 'Remove' : 'Kaldır'}>
														<XMarkIcon className='w-4 h-4' />
													</Button>
												</div>
											))}
										</div>
									</div>
								)}

								{/* Popüler Aramalar */}
								<div
									className={`px-4 pb-3 ${recentSearches.length > 0 ? 'pt-2 border-t border-border-subtle' : 'pt-3'}`}>
									<span className='text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5 mb-2'>
										<FireIcon className='w-3.5 h-3.5 shrink-0' />
										{locale === 'en' ? 'Popular Searches' : 'Popüler Aramalar'}
									</span>
									<div className='flex flex-wrap gap-2'>
										{POPULAR_SEARCHES[locale as 'tr' | 'en']?.map((s) => (
											<Button
												variant='secondary'
												key={s}
												type='button'
												onClick={() => navigateSearch(s)}
												className='px-3 py-1.5 text-sm bg-surface-alt hover:bg-primary-100 text-body hover:text-primary-600 rounded-full transition-colors whitespace-nowrap'>
												{s}
											</Button>
										))}
									</div>
								</div>

								{/* Tüm ilanları gör */}
								<Link
									href='/listings'
									className='flex items-center justify-between px-4 py-2.5 text-sm text-muted hover:bg-primary-50 hover:text-primary-600 border-t border-border-subtle transition-colors'
									onClick={() => setShowSearchDropdown(false)}>
									<span>
										{locale === 'en'
											? 'Browse all listings'
											: 'Tüm ilanları gör'}
									</span>
									<ArrowRightIcon className='w-4 h-4' />
								</Link>
							</div>
						) : (
							/* === STATE 2: Typing — Categorized results === */
							<div className='max-h-[480px] overflow-y-auto'>
								{isAutocompleteLoading ? (
									<div className='flex items-center justify-center py-8'>
										<Spinner
											size='md'
											color='border-primary-500 border-t-transparent'
										/>
									</div>
								) : (
									<>
										{/* İlgili Sonuçlar başlığı */}
										<div className='px-4 pt-3 pb-1'>
											<span className='text-xs font-semibold text-muted uppercase tracking-wide'>
												{locale === 'en'
													? 'Related Results'
													: 'İlgili Sonuçlar'}
											</span>
										</div>

										{/* Ürünler */}
										{autoResults?.products &&
											autoResults.products.length > 0 && (
												<div>
													{autoResults.products.map((product, idx) => {
														const itemIdx = idx;
														return (
															<Link
																key={product.id}
																href={`/listings/${product.id}`}
																className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? 'bg-primary-50' : 'hover:bg-surface'}`}
																onClick={() => setShowSearchDropdown(false)}>
																{product.imageUrl &&
																isValidImageSrc(product.imageUrl) ? (
																	<img
																		src={product.imageUrl}
																		alt={product.title}
																		className='w-12 h-12 rounded-lg object-cover bg-surface-alt flex-shrink-0 border border-border'
																		onError={(e) => {
																			(
																				e.target as HTMLImageElement
																			).style.display = 'none';
																			(
																				e.target as HTMLImageElement
																			).nextElementSibling?.classList.remove(
																				'hidden',
																			);
																		}}
																	/>
																) : null}
																<div
																	className={`w-12 h-12 rounded-lg bg-surface-alt flex-shrink-0 flex items-center justify-center border border-border ${product.imageUrl && isValidImageSrc(product.imageUrl) ? 'hidden' : ''}`}>
																	<ShoppingBagIcon className='w-5 h-5 text-subtle' />
																</div>
																<div className='flex-1 min-w-0'>
																	<p className='text-sm text-heading font-medium truncate'>
																		{product.title}
																	</p>
																	<p className='text-xs text-primary-600 font-semibold'>
																		{product.price.toLocaleString('tr-TR', {
																			minimumFractionDigits: 2,
																			maximumFractionDigits: 2,
																		})}{' '}
																		TL
																	</p>
																</div>
																<span className='text-[11px] text-subtle font-medium px-2 py-0.5 bg-surface-alt rounded-full flex-shrink-0'>
																	{locale === 'en' ? 'Product' : 'Ürün'}
																</span>
															</Link>
														);
													})}
												</div>
											)}

										{/* Markalar (Car Brands) */}
										{autoResults?.brands && autoResults.brands.length > 0 && (
											<div
												className={
													autoResults?.products?.length
														? 'border-t border-border-subtle'
														: ''
												}>
												{autoResults.brands.map((brand) => {
													const itemIdx =
														(autoResults?.products?.length || 0) +
														autoResults.brands.indexOf(brand);
													return (
														<Link
															key={brand.id}
															href={`/listings?brand=${encodeURIComponent(brand.name)}`}
															className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? 'bg-primary-50' : 'hover:bg-surface'}`}
															onClick={() => setShowSearchDropdown(false)}>
															{brand.logo ? (
																<img
																	src={brand.logo}
																	alt={brand.name}
																	className='w-10 h-10 rounded-full object-contain bg-surface-elevated flex-shrink-0 border border-border p-0.5'
																/>
															) : (
																<div className='w-10 h-10 rounded-full bg-primary-100 flex-shrink-0 flex items-center justify-center text-primary-600 text-sm font-bold'>
																	{brand.name.charAt(0)}
																</div>
															)}
															<span className='flex-1 text-sm text-heading font-medium truncate'>
																{brand.name}
															</span>
															<span className='text-[11px] text-primary-600 font-medium px-2 py-0.5 bg-primary-50 rounded-full flex-shrink-0'>
																{locale === 'en' ? 'Brand' : 'Marka'}
															</span>
														</Link>
													);
												})}
											</div>
										)}

										{/* Kategoriler */}
										{autoResults?.categories &&
											autoResults.categories.length > 0 && (
												<div
													className={
														autoResults?.products?.length ||
														autoResults?.brands?.length
															? 'border-t border-border-subtle'
															: ''
													}>
													{autoResults.categories.map((cat) => {
														const itemIdx =
															(autoResults?.products?.length || 0) +
															(autoResults?.brands?.length || 0) +
															autoResults.categories.indexOf(cat);
														return (
															<Link
																key={cat.id}
																href={`/listings?categoryId=${cat.id}`}
																className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? 'bg-primary-50' : 'hover:bg-surface'}`}
																onClick={() => setShowSearchDropdown(false)}>
																<div className='w-10 h-10 rounded-full bg-info-50 flex-shrink-0 flex items-center justify-center text-info-500 border border-info-100'>
																	<TagIcon className='w-5 h-5' />
																</div>
																<span className='flex-1 text-sm text-heading font-medium truncate'>
																	{cat.name}
																</span>
																<span className='text-[11px] text-info-600 font-medium px-2 py-0.5 bg-info-50 rounded-full flex-shrink-0'>
																	{locale === 'en' ? 'Category' : 'Kategori'}
																</span>
															</Link>
														);
													})}
												</div>
											)}

										{/* Üreticiler (Manufacturers) */}
										{autoResults?.manufacturers &&
											autoResults.manufacturers.length > 0 && (
												<div
													className={
														autoResults?.products?.length ||
														autoResults?.brands?.length ||
														autoResults?.categories?.length
															? 'border-t border-border-subtle'
															: ''
													}>
													{autoResults.manufacturers.map((mfr) => {
														const itemIdx =
															(autoResults?.products?.length || 0) +
															(autoResults?.brands?.length || 0) +
															(autoResults?.categories?.length || 0) +
															autoResults.manufacturers.indexOf(mfr);
														return (
															<Link
																key={mfr.id}
																href={`/listings?manufacturer=${encodeURIComponent(mfr.name)}&manufacturerId=${mfr.id}`}
																className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? 'bg-primary-50' : 'hover:bg-surface'}`}
																onClick={() => setShowSearchDropdown(false)}>
																{mfr.logo ? (
																	<img
																		src={mfr.logo}
																		alt={mfr.name}
																		className='w-10 h-10 rounded-full object-contain bg-surface-elevated flex-shrink-0 border border-border p-0.5'
																	/>
																) : (
																	<div className='w-10 h-10 rounded-full bg-primary-50 flex-shrink-0 flex items-center justify-center text-primary-600 text-sm font-bold border border-primary-100'>
																		{mfr.name.charAt(0)}
																	</div>
																)}
																<span className='flex-1 text-sm text-heading font-medium truncate'>
																	{mfr.name}
																</span>
																<span className='text-[11px] text-primary-600 font-medium px-2 py-0.5 bg-primary-50 rounded-full flex-shrink-0'>
																	{locale === 'en' ? 'Manufacturer' : 'Üretici'}
																</span>
															</Link>
														);
													})}
												</div>
											)}

										{/* Modeller (Car Models) */}
										{autoResults?.carModels &&
											autoResults.carModels.length > 0 && (
												<div
													className={
														autoResults?.products?.length ||
														autoResults?.brands?.length ||
														autoResults?.categories?.length ||
														autoResults?.manufacturers?.length
															? 'border-t border-border-subtle'
															: ''
													}>
													{autoResults.carModels.map((m) => {
														const itemIdx =
															(autoResults?.products?.length || 0) +
															(autoResults?.brands?.length || 0) +
															(autoResults?.categories?.length || 0) +
															(autoResults?.manufacturers?.length || 0) +
															(autoResults?.carModels ?? []).indexOf(m);
														return (
															<Link
																key={m.id}
																href={`/listings?carModelId=${m.id}&carModel=${encodeURIComponent(m.name)}`}
																className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? 'bg-primary-50' : 'hover:bg-surface'}`}
																onClick={() => setShowSearchDropdown(false)}>
																<div className='w-10 h-10 rounded-full bg-success-50 flex-shrink-0 flex items-center justify-center text-success-600 text-sm font-bold border border-success-100'>
																	{m.name.charAt(0)}
																</div>
																<span className='flex-1 text-sm text-heading font-medium truncate'>
																	{m.name}
																</span>
																<span className='text-[11px] text-success-600 font-medium px-2 py-0.5 bg-success-50 rounded-full flex-shrink-0'>
																	{locale === 'en' ? 'Model' : 'Model'}
																</span>
															</Link>
														);
													})}
												</div>
											)}

										{/* Ölçek (Scale) */}
										{autoResults?.scales && autoResults.scales.length > 0 && (
											<div
												className={
													autoResults?.products?.length ||
													autoResults?.brands?.length ||
													autoResults?.categories?.length ||
													autoResults?.manufacturers?.length ||
													autoResults?.carModels?.length
														? 'border-t border-border-subtle'
														: ''
												}>
												{autoResults.scales.map((s) => {
													const itemIdx =
														(autoResults?.products?.length || 0) +
														(autoResults?.brands?.length || 0) +
														(autoResults?.categories?.length || 0) +
														(autoResults?.manufacturers?.length || 0) +
														(autoResults?.carModels?.length || 0) +
														(autoResults?.scales ?? []).indexOf(s);
													return (
														<Link
															key={s}
															href={`/listings?scale=${encodeURIComponent(s)}`}
															className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? 'bg-primary-50' : 'hover:bg-surface'}`}
															onClick={() => setShowSearchDropdown(false)}>
															<div className='w-10 h-10 rounded-full bg-warning-50 flex-shrink-0 flex items-center justify-center text-warning-600 text-xs font-bold border border-warning-100'>
																{s}
															</div>
															<span className='flex-1 text-sm text-heading font-medium truncate'>
																{s}
															</span>
															<span className='text-[11px] text-warning-600 font-medium px-2 py-0.5 bg-warning-50 rounded-full flex-shrink-0'>
																{locale === 'en' ? 'Scale' : 'Ölçek'}
															</span>
														</Link>
													);
												})}
											</div>
										)}

										{/* Malzeme (Material) */}
										{autoResults?.materials &&
											autoResults.materials.length > 0 && (
												<div
													className={
														autoResults?.products?.length ||
														autoResults?.brands?.length ||
														autoResults?.categories?.length ||
														autoResults?.manufacturers?.length ||
														autoResults?.carModels?.length ||
														autoResults?.scales?.length
															? 'border-t border-border-subtle'
															: ''
													}>
													{autoResults.materials.map((mat) => {
														const itemIdx =
															(autoResults?.products?.length || 0) +
															(autoResults?.brands?.length || 0) +
															(autoResults?.categories?.length || 0) +
															(autoResults?.manufacturers?.length || 0) +
															(autoResults?.carModels?.length || 0) +
															(autoResults?.scales?.length || 0) +
															(autoResults?.materials ?? []).indexOf(mat);
														return (
															<Link
																key={mat.slug}
																href={`/listings?material=${encodeURIComponent(mat.slug)}`}
																className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? 'bg-primary-50' : 'hover:bg-surface'}`}
																onClick={() => setShowSearchDropdown(false)}>
																<div className='w-10 h-10 rounded-full bg-surface flex-shrink-0 flex items-center justify-center text-muted text-sm font-bold border border-border-subtle'>
																	{mat.label.charAt(0)}
																</div>
																<span className='flex-1 text-sm text-heading font-medium truncate'>
																	{mat.label}
																</span>
																<span className='text-[11px] text-muted font-medium px-2 py-0.5 bg-surface rounded-full flex-shrink-0'>
																	{locale === 'en' ? 'Material' : 'Malzeme'}
																</span>
															</Link>
														);
													})}
												</div>
											)}

										{/* Durum (Condition) */}
										{autoResults?.conditions &&
											autoResults.conditions.length > 0 && (
												<div
													className={
														autoResults?.products?.length ||
														autoResults?.brands?.length ||
														autoResults?.categories?.length ||
														autoResults?.manufacturers?.length ||
														autoResults?.carModels?.length ||
														autoResults?.scales?.length ||
														autoResults?.materials?.length
															? 'border-t border-border-subtle'
															: ''
													}>
													{autoResults.conditions.map((cond) => {
														const itemIdx =
															(autoResults?.products?.length || 0) +
															(autoResults?.brands?.length || 0) +
															(autoResults?.categories?.length || 0) +
															(autoResults?.manufacturers?.length || 0) +
															(autoResults?.carModels?.length || 0) +
															(autoResults?.scales?.length || 0) +
															(autoResults?.materials?.length || 0) +
															(autoResults?.conditions ?? []).indexOf(cond);
														return (
															<Link
																key={cond.value}
																href={`/listings?condition=${encodeURIComponent(cond.value)}`}
																className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? 'bg-primary-50' : 'hover:bg-surface'}`}
																onClick={() => setShowSearchDropdown(false)}>
																<div className='w-10 h-10 rounded-full bg-success-50 flex-shrink-0 flex items-center justify-center text-success-600 text-sm font-bold border border-success-100'>
																	{cond.label.charAt(0)}
																</div>
																<span className='flex-1 text-sm text-heading font-medium truncate'>
																	{cond.label}
																</span>
																<span className='text-[11px] text-success-600 font-medium px-2 py-0.5 bg-success-50 rounded-full flex-shrink-0'>
																	{locale === 'en' ? 'Condition' : 'Durum'}
																</span>
															</Link>
														);
													})}
												</div>
											)}

										{/* No results */}
										{!autoResults?.products?.length &&
											!autoResults?.brands?.length &&
											!autoResults?.categories?.length &&
											!autoResults?.manufacturers?.length &&
											!autoResults?.carModels?.length &&
											!autoResults?.scales?.length &&
											!autoResults?.materials?.length &&
											!autoResults?.conditions?.length && (
												<div className='px-4 py-6 text-center text-sm text-muted'>
													{locale === 'en'
														? 'No results found'
														: 'Sonuç bulunamadı'}
												</div>
											)}

										{/* "...ile ara" footer */}
										<Button
											variant='secondary'
											type='button'
											onClick={() => navigateSearch(debouncedQuery)}
											className={`flex items-center justify-between w-full px-4 py-3 text-sm font-medium border-t border-border-subtle transition-colors ${activeIndex === flatItems.length - 1 ? 'bg-primary-50 text-primary-600' : 'text-primary-600 hover:bg-primary-50'}`}>
											<span>
												&ldquo;{debouncedQuery}&rdquo;{' '}
												{locale === 'en' ? 'search for' : 'ile ara'}
											</span>
											<ArrowRightIcon className='w-4 h-4' />
										</Button>
									</>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
