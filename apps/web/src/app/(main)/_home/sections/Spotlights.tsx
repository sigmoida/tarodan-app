/** @format */

'use client';

import Link from 'next/link';
import {
	CheckBadgeIcon,
	HandThumbUpIcon,
	StarIcon,
} from '@heroicons/react/24/solid';
import OptimizedImage from '@/components/OptimizedImage';
import UserAvatar from '@/components/UserAvatar';
import { ButtonLink, ProductBadge } from '@/components/ui';
import { useTranslation } from '@/i18n/LanguageContext';
import { useHome } from '../context/HomeDataContext';
import { getImageUrl } from '../lib/helpers';

export default function Spotlights() {
	const { locale } = useTranslation();
	const {
		featuredCollectorToShow,
		companyOfWeek,
		isLoadingFeaturedCollector,
		isLoadingCompany,
	} = useHome();

	if (
		!(
			featuredCollectorToShow ||
			companyOfWeek ||
			isLoadingFeaturedCollector ||
			isLoadingCompany
		) /* always shows via demo fallback */
	)
		return null;

	return (
		<section className='py-3'>
			<div className='px-4'>
				<div className='grid gap-4 md:grid-cols-2'>
					{isLoadingFeaturedCollector ? (
						<div className='bg-surface-elevated border border-border p-4 rounded'>
							<div className='animate-pulse space-y-3'>
								<div className='h-5 bg-border-subtle rounded w-2/3' />
								<div className='flex items-center gap-3'>
									<div className='w-14 h-14 bg-border-subtle rounded-full' />
									<div className='flex-1 space-y-2'>
										<div className='h-4 bg-border-subtle rounded w-1/2' />
										<div className='h-3 bg-border-subtle rounded w-1/3' />
									</div>
								</div>
								<div className='grid grid-cols-5 gap-2'>
									{[...Array(5)].map((_, i) => (
										<div
											key={i}
											className='aspect-square bg-border-subtle rounded'
										/>
									))}
								</div>
								<div className='h-9 bg-border-subtle rounded w-full' />
							</div>
						</div>
					) : featuredCollectorToShow ? (
						<div className='bg-primary-50 border border-primary-100 p-5 flex flex-col rounded'>
							<div className='flex justify-start mb-4'>
								<h2 className='text-xl font-extrabold text-heading tracking-tight flex items-center gap-2'>
									<div className='w-1 h-7 bg-primary-500 rounded-sm flex-shrink-0' />
									{locale === 'en'
										? 'Collector of the Week'
										: 'Haftanın Koleksiyoneri'}
								</h2>
							</div>
							<div className='flex items-start gap-4 mb-4'>
								<UserAvatar
									displayName={featuredCollectorToShow.user?.displayName}
									avatarUrl={featuredCollectorToShow.user?.avatarUrl}
									size='lg'
								/>
								<div className='min-w-0'>
									<h3 className='text-sm font-bold text-heading flex items-center gap-1.5 mb-0.5'>
										{featuredCollectorToShow.user?.displayName ||
											(locale === 'en' ? 'Collector' : 'Koleksiyoner')}
										{featuredCollectorToShow.user?.isVerified && (
											<CheckBadgeIcon className='w-4 h-4 text-success-500' />
										)}
									</h3>
									<p className='text-xs text-primary-600 font-medium'>
										{featuredCollectorToShow.name}
									</p>
									<p className='text-xs text-muted mt-1 line-clamp-2'>
										{featuredCollectorToShow?.description ||
											`${featuredCollectorToShow.itemCount || 0} ${locale === 'en' ? 'items' : 'araç'}`}
									</p>
								</div>
							</div>
							<div className='flex items-center gap-4 mb-4 text-xs'>
								<span className='flex items-center gap-1 text-info-500 font-semibold'>
									<svg
										className='w-3.5 h-3.5'
										fill='currentColor'
										viewBox='0 0 20 20'>
										<path d='M10 12a2 2 0 100-4 2 2 0 000 4z' />
										<path
											fillRule='evenodd'
											d='M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z'
											clipRule='evenodd'
										/>
									</svg>
									{featuredCollectorToShow.viewCount?.toLocaleString() || 0}
								</span>
								<span className='flex items-center gap-1 text-danger-500 font-semibold'>
									<HandThumbUpIcon className='w-3.5 h-3.5' />{' '}
									{featuredCollectorToShow.likeCount?.toLocaleString() || 0}
								</span>
								<span className='text-muted'>
									{featuredCollectorToShow.itemCount || 0}{' '}
									{locale === 'en' ? 'items' : 'araç'}
								</span>
							</div>
							{featuredCollectorToShow.items &&
								featuredCollectorToShow.items.length > 0 && (
									<div className='grid grid-cols-4 sm:grid-cols-5 gap-2 mb-4'>
										{featuredCollectorToShow.items.slice(0, 5).map((item) => (
											<Link
												key={item.id}
												href={
													item.productId ? `/listings/${item.productId}` : '#'
												}
												className='block'>
												<div className='relative aspect-square bg-surface-alt rounded overflow-hidden'>
													<OptimizedImage
														src={getImageUrl(item.productImage)}
														alt={item.productTitle}
														fill
														className='object-cover'
														fallbackSrc={`https://placehold.co/200x200/f5f5f7/9ca3af?text=+`}
														logContext={{
															itemId: item.id,
															page: 'home-featured-collector-item',
														}}
													/>
												</div>
											</Link>
										))}
									</div>
								)}
							<ButtonLink
								href={`/collections/${featuredCollectorToShow.id}`}
								className='mt-auto w-full text-center'>
								{locale === 'en' ? 'View Collection' : 'Koleksiyonu incele'}
							</ButtonLink>
						</div>
					) : null}
					{isLoadingCompany ? (
						<div className='bg-surface-elevated border border-border p-4 rounded'>
							<div className='animate-pulse space-y-3'>
								<div className='h-5 bg-border-subtle rounded w-2/3' />
								<div className='flex items-center gap-3'>
									<div className='w-14 h-14 bg-border-subtle rounded-full' />
									<div className='flex-1 space-y-2'>
										<div className='h-4 bg-border-subtle rounded w-1/2' />
										<div className='h-3 bg-border-subtle rounded w-1/3' />
									</div>
								</div>
								<div className='grid grid-cols-4 gap-2'>
									{[...Array(4)].map((_, i) => (
										<div
											key={i}
											className='h-12 bg-border-subtle rounded'
										/>
									))}
								</div>
								<div className='h-9 bg-border-subtle rounded w-full' />
							</div>
						</div>
					) : companyOfWeek ? (
						<div className='bg-surface-elevated border border-border p-5 flex flex-col rounded'>
							<div className='flex justify-start mb-4'>
								<h2 className='text-xl font-extrabold text-heading tracking-tight flex items-center gap-2'>
									<div className='w-1 h-7 bg-primary-500 rounded-sm flex-shrink-0' />
									{locale === 'en' ? 'Company of the Week' : 'Haftanın Şirketi'}
									<ProductBadge variant='default'>Business</ProductBadge>
								</h2>
							</div>
							<div className='flex items-start gap-4 mb-4'>
								<UserAvatar
									displayName={companyOfWeek.displayName}
									avatarUrl={companyOfWeek.avatarUrl}
									size='lg'
									className='border-2 border-border-subtle'
								/>
								<div className='min-w-0'>
									<h3 className='text-sm font-bold text-heading flex items-center gap-1.5 mb-0.5'>
										{companyOfWeek.displayName || companyOfWeek.companyName}
										{companyOfWeek.isVerified && (
											<CheckBadgeIcon className='w-4 h-4 text-success-500' />
										)}
									</h3>
									<p className='text-xs text-muted line-clamp-2'>
										{companyOfWeek.bio ||
											(locale === 'en'
												? 'Premium Diecast vehicle buying and selling'
												: 'Premium Diecast araçların alım ve satımı')}
									</p>
									{companyOfWeek.stats?.averageRating > 0 && (
										<div className='flex items-center gap-1 mt-1'>
											<StarIcon className='w-3.5 h-3.5 text-warning-400' />
											<span className='text-xs font-semibold text-heading'>
												{companyOfWeek.stats.averageRating.toFixed(1)}
											</span>
											<span className='text-xs text-muted'>
												({companyOfWeek.stats.totalRatings || 0})
											</span>
										</div>
									)}
								</div>
							</div>
							<div className='grid grid-cols-4 gap-2 mb-4'>
								<div className='bg-surface-alt rounded p-2 text-center'>
									<p className='text-sm font-bold text-heading'>
										{companyOfWeek.stats?.totalProducts || 0}
									</p>
									<p className='text-[10px] text-muted'>
										{locale === 'en' ? 'Products' : 'Ürün'}
									</p>
								</div>
								<div className='bg-surface-alt rounded p-2 text-center'>
									<p className='text-sm font-bold text-heading'>
										{companyOfWeek.stats?.totalSales || 0}
									</p>
									<p className='text-[10px] text-muted'>
										{locale === 'en' ? 'Sales' : 'Satış'}
									</p>
								</div>
								<div className='bg-surface-alt rounded p-2 text-center'>
									<p className='text-sm font-bold text-heading'>
										{(companyOfWeek.stats?.totalViews || 0).toLocaleString()}
									</p>
									<p className='text-[10px] text-muted'>
										{locale === 'en' ? 'Views' : 'Görüntü'}
									</p>
								</div>
								<div className='bg-surface-alt rounded p-2 text-center'>
									<p className='text-sm font-bold text-heading'>
										{(companyOfWeek.stats?.totalLikes || 0).toLocaleString()}
									</p>
									<p className='text-[10px] text-muted'>
										{locale === 'en' ? 'Likes' : 'Beğeni'}
									</p>
								</div>
							</div>
							{companyOfWeek.products && companyOfWeek.products.length > 0 && (
								<div className='grid grid-cols-4 sm:grid-cols-5 gap-2 mb-4'>
									{companyOfWeek.products.slice(0, 5).map((product) => (
										<Link
											key={product.id}
											href={`/listings/${product.id}`}
											className='block'>
											<div className='relative aspect-square bg-surface-alt rounded overflow-hidden'>
												<OptimizedImage
													src={
														product.image ||
														`https://placehold.co/200x200/f5f5f7/9ca3af?text=+`
													}
													alt={product.title}
													fill
													className='object-cover'
													fallbackSrc={`https://placehold.co/200x200/f5f5f7/9ca3af?text=+`}
													logContext={{
														productId: product.id,
														page: 'home-company-product',
													}}
												/>
											</div>
										</Link>
									))}
								</div>
							)}
							<ButtonLink
								href={`/seller/${companyOfWeek.id}`}
								className='mt-auto w-full text-center'>
								{locale === 'en' ? 'View Store' : 'Mağazayı İncele'}
							</ButtonLink>
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}
