/** @format */

'use client';

import {
	StarIcon,
	ChatBubbleLeftRightIcon,
	CheckBadgeIcon,
} from '@heroicons/react/24/outline';
import { Button, Select, Spinner } from '@tarodan/ui';
import UserAvatar from '@/components/UserAvatar';
import { useListingDetail } from '../_context/ListingDetailContext';

export default function ProductReviews() {
	const {
		t,
		locale,
		reviews,
		reviewStats,
		reviewsLoading,
		reviewSortBy,
		setReviewSortBy,
		reviewFilterScore,
		setReviewFilterScore,
	} = useListingDetail();

	return (
		<div className='max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-6 sm:py-12'>
			<div className='bg-surface-elevated rounded shadow-sm p-4 sm:p-6 md:p-8'>
				{/* Header */}
				<div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6'>
					<h2 className='text-2xl font-bold text-heading'>
						{t('product.productReviews')}
					</h2>
					{reviewStats && (
						<div className='flex items-center gap-2'>
							<div className='flex items-center'>
								{[1, 2, 3, 4, 5].map((star) => (
									<StarIcon
										key={star}
										className={`w-5 h-5 ${
											star <= (reviewStats.averageRating || 0)
												? 'text-warning-400 fill-warning-400'
												: 'text-border-strong'
										}`}
									/>
								))}
							</div>
							<span className='text-lg font-semibold text-heading'>
								{(reviewStats.averageRating || 0).toFixed(1)}
							</span>
							<span className='text-muted'>
								({reviewStats.totalRatings || 0} {t('review.reviews')})
							</span>
						</div>
					)}
				</div>

				{/* Distribution + filters */}
				{reviewStats &&
					reviewStats.scoreDistribution &&
					reviewStats.totalRatings > 0 && (
						<div className='mb-6 p-4 bg-surface rounded-lg'>
							<div className='flex flex-col sm:flex-row gap-6'>
								<div className='flex-1 space-y-1.5'>
									{[5, 4, 3, 2, 1].map((star) => {
										const count = reviewStats.scoreDistribution?.[star] || 0;
										const pct =
											reviewStats.totalRatings > 0
												? Math.round((count / reviewStats.totalRatings) * 100)
												: 0;
										const isActive = reviewFilterScore === star;
										return (
											<Button
												variant='secondary'
												key={star}
												onClick={() => setReviewFilterScore(isActive ? null : star)}
												className={`flex items-center gap-2 w-full text-left px-2 py-0.5 rounded transition-colors ${isActive ? 'bg-warning-100' : 'hover:bg-surface-alt'}`}>
												<span className='text-sm font-medium w-3'>{star}</span>
												<StarIcon className='w-4 h-4 text-warning-400 fill-warning-400 flex-shrink-0' />
												<div className='flex-1 h-2 bg-border-subtle rounded-full overflow-hidden'>
													<div
														className='h-full bg-warning-400 rounded-full transition-all'
														style={{ width: `${pct}%` }}
													/>
												</div>
												<span className='text-xs text-muted w-8 text-right'>
													{count}
												</span>
											</Button>
										);
									})}
								</div>

								<div className='sm:w-48'>
									<label className='block text-xs font-medium text-muted mb-1'>
										{locale === 'en' ? 'Sort by' : 'Sırala'}
									</label>
									<Select
										value={reviewSortBy}
										onChange={(e) => setReviewSortBy(e.target.value)}>
										<option value='newest'>
											{locale === 'en' ? 'Most Recent' : 'En Yeni'}
										</option>
										<option value='oldest'>
											{locale === 'en' ? 'Oldest' : 'En Eski'}
										</option>
										<option value='highest'>
											{locale === 'en' ? 'Highest Rating' : 'En Yüksek Puan'}
										</option>
										<option value='lowest'>
											{locale === 'en' ? 'Lowest Rating' : 'En Düşük Puan'}
										</option>
										<option value='helpful'>
											{locale === 'en' ? 'Most Helpful' : 'En Faydalı'}
										</option>
									</Select>
									{reviewFilterScore && (
										<Button
											variant='secondary'
											onClick={() => setReviewFilterScore(null)}
											className='mt-2 text-xs text-primary-500 hover:underline'>
											{locale === 'en' ? 'Clear filter' : 'Filtreyi temizle'}
										</Button>
									)}
								</div>
							</div>
						</div>
					)}

				{reviewsLoading ? (
					<div className='flex justify-center py-8'>
						<Spinner size='lg' color='border-primary-500 border-t-transparent' />
					</div>
				) : reviews.length === 0 ? (
					<div className='text-center py-12 bg-surface rounded'>
						<ChatBubbleLeftRightIcon className='w-12 h-12 mx-auto mb-4 text-subtle' />
						<p className='text-lg font-medium text-heading mb-2'>
							{reviewFilterScore
								? locale === 'en'
									? 'No reviews with this rating'
									: 'Bu puana sahip değerlendirme yok'
								: t('product.noReviews')}
						</p>
						{!reviewFilterScore && (
							<p className='text-muted'>{t('product.beFirstToReview')}</p>
						)}
					</div>
				) : (
					<div className='space-y-6'>
						{reviews.map((review: any) => (
							<div
								key={review.id}
								className='border-b border-border-subtle pb-6 last:border-0 last:pb-0'>
								<div className='flex items-start gap-4'>
									<UserAvatar
										displayName={review.userName || review.user?.displayName}
										avatarUrl={review.user?.avatarUrl}
										size='sm'
									/>
									<div className='flex-1'>
										<div className='flex items-center flex-wrap gap-2 mb-1'>
											<span className='font-medium text-heading'>
												{review.isAnonymous ||
												(!review.userName && !review.user?.displayName)
													? locale === 'en'
														? 'Anonymous'
														: 'Anonim'
													: review.userName || review.user?.displayName}
											</span>
											<div className='flex'>
												{[1, 2, 3, 4, 5].map((star) => (
													<StarIcon
														key={star}
														className={`w-4 h-4 ${
															star <= (review.score || 0)
																? 'text-warning-400 fill-warning-400'
																: 'text-border-strong'
														}`}
													/>
												))}
											</div>
											{review.isVerifiedPurchase && (
												<span className='inline-flex items-center gap-1 text-xs text-success-700 bg-success-50 px-2 py-0.5 rounded-full'>
													<CheckBadgeIcon className='w-3.5 h-3.5' />
													{locale === 'en'
														? 'Verified Purchase'
														: 'Doğrulanmış Alıcı'}
												</span>
											)}
											<span className='text-sm text-muted'>
												{new Date(review.createdAt).toLocaleDateString('tr-TR')}
											</span>
										</div>
										{review.title && (
											<h4 className='font-medium text-heading mb-1'>
												{review.title}
											</h4>
										)}
										{(review.review || review.comment) && (
											<p className='text-body'>{review.review || review.comment}</p>
										)}
										{review.images && review.images.length > 0 && (
											<div className='flex flex-wrap gap-2 mt-3'>
												{review.images.map((img: string, idx: number) => (
													<a
														key={idx}
														href={img}
														target='_blank'
														rel='noopener noreferrer'
														className='block w-20 h-20 rounded-lg overflow-hidden border border-border hover:border-primary-400 transition-colors'>
														{/* eslint-disable-next-line @next/next/no-img-element */}
														<img
															src={img}
															alt={`Review ${idx + 1}`}
															className='w-full h-full object-cover'
														/>
													</a>
												))}
											</div>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
