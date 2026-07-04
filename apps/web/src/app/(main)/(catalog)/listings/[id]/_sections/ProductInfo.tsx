/** @format */

'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
	ShoppingCartIcon,
	HeartIcon,
	ShareIcon,
	BoltIcon,
	FolderPlusIcon,
	FlagIcon,
	ArrowsRightLeftIcon,
	PencilIcon,
	ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import { Button } from '@tarodan/ui';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { formatCondition } from '@/lib/format';
import {
	isProductOnSaleDisplay,
	getProductOriginalPriceForDisplay,
} from '@/lib/productPrice';
import { useListingDetail } from '../_context/ListingDetailContext';
import SellerCard from './SellerCard';

export default function ProductInfo() {
	const {
		t,
		locale,
		router,
		listing,
		effectivePrice,
		isFavorite,
		isOwner,
		isAuthenticated,
		limits,
		canTrade,
		isTradeAvailable,
		isInCart,
		isAddingToCart,
		cartLoading,
		showShareMenu,
		handleToggleFavorite,
		handleShare,
		shareToSocial,
		handleBuyNow,
		handleMakeOffer,
		handleCartToggle,
		handleOpenCollectionModal,
		requireAuth,
		setShowReportModal,
		setShowTradeModal,
	} = useListingDetail();

	if (!listing) return null;

	const available =
		listing.availableQuantity !== undefined && listing.availableQuantity !== null
			? listing.availableQuantity
			: listing.quantity;
	const hasStock = available === null || available === undefined || available > 0;

	return (
		<div>
			{/* Sold banner */}
			{listing.status === 'sold' && (
				<div className='bg-danger-50 border border-danger-200 rounded p-4 mb-4 flex items-center gap-3'>
					<div className='w-10 h-10 bg-danger-100 rounded-full flex items-center justify-center'>
						<ExclamationTriangleIcon className='w-5 h-5 text-danger-600' />
					</div>
					<div>
						<p className='font-semibold text-danger-800'>
							{t('product.soldOut')}
						</p>
						<p className='text-sm text-danger-600'>
							{t('product.productNoLongerAvailable')}
						</p>
					</div>
				</div>
			)}

			{/* Title + quick actions */}
			<div className='flex items-start justify-between gap-4 mb-4'>
				<div className='flex items-center gap-3 flex-wrap'>
					<h1 className='text-2xl lg:text-3xl font-bold text-heading'>
						{listing.title}
					</h1>
					{listing.status === 'sold' && (
						<span className='px-3 py-1 bg-danger-100 text-danger-700 text-sm font-semibold rounded'>
							{t('product.sold')}
						</span>
					)}
				</div>
				<div className='flex gap-2'>
					<Button
						variant='secondary'
						onClick={handleToggleFavorite}
						className='p-2 rounded hover:bg-surface-alt transition-colors'
						title={t('product.addToFavorites')}>
						{isFavorite ? (
							<HeartSolidIcon className='w-6 h-6 text-danger-500' />
						) : (
							<HeartIcon className='w-6 h-6 text-subtle' />
						)}
					</Button>
					<div className='relative'>
						<Button
							variant='secondary'
							onClick={handleShare}
							className='p-2 rounded hover:bg-surface-alt transition-colors'
							title={locale === 'en' ? 'Share' : 'Paylaş'}>
							<ShareIcon className='w-6 h-6 text-subtle' />
						</Button>

						{showShareMenu && (
							<div className='absolute right-0 top-full mt-2 w-48 bg-surface-elevated rounded shadow-lg border border-border py-2 z-50'>
								<Button
									variant='secondary'
									onClick={() => shareToSocial('whatsapp')}
									className='w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3'>
									<span className='text-success-500 text-lg'>📱</span>
									WhatsApp
								</Button>
								<Button
									variant='secondary'
									onClick={() => shareToSocial('twitter')}
									className='w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3'>
									<span className='text-primary-400 text-lg'>𝕏</span>
									Twitter / X
								</Button>
								<Button
									variant='secondary'
									onClick={() => shareToSocial('facebook')}
									className='w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3'>
									<span className='text-primary-600 text-lg'>📘</span>
									Facebook
								</Button>
								<Button
									variant='secondary'
									onClick={() => shareToSocial('telegram')}
									className='w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3'>
									<span className='text-primary-500 text-lg'>✈️</span>
									Telegram
								</Button>
								<hr className='my-1' />
								<Button
									variant='secondary'
									onClick={() => shareToSocial('copy')}
									className='w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3'>
									<span className='text-muted text-lg'>📋</span>
									{locale === 'en' ? 'Copy Link' : 'Linki Kopyala'}
								</Button>
								{typeof navigator !== 'undefined' && 'share' in navigator && (
									<Button
										variant='secondary'
										onClick={() => shareToSocial('native')}
										className='w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3'>
										<span className='text-muted text-lg'>🔗</span>
										{locale === 'en' ? 'More…' : 'Diğer...'}
									</Button>
								)}
							</div>
						)}
					</div>
					{/* Report */}
					<Button
						variant='secondary'
						onClick={() => {
							if (!isAuthenticated) {
								requireAuth({
									title: t('product.reportListing'),
									message: t('product.reportListingMsg'),
									icon: <FlagIcon className='w-10 h-10 text-danger-500' />,
								});
							} else {
								setShowReportModal(true);
							}
						}}
						className='p-2 rounded hover:bg-danger-50 transition-colors'
						title={t('product.reportListing')}>
						<FlagIcon className='w-6 h-6 text-subtle hover:text-danger-500' />
					</Button>
				</div>
			</div>

			{/* Price */}
			<div className='mb-4'>
				{isProductOnSaleDisplay(listing) && (
					<div className='flex items-center gap-2 mb-1'>
						<span className='text-xl text-subtle line-through'>
							{getProductOriginalPriceForDisplay(listing).toLocaleString('tr-TR', {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2,
							})}{' '}
							TL
						</span>
						<span className='bg-danger-500 text-inverted text-sm font-bold px-2 py-0.5 rounded'>
							%
							{listing.discountPercent ??
								(listing.oldPrice != null && listing.price
									? Math.round(
											(1 - Number(listing.price) / Number(listing.oldPrice)) * 100,
										)
									: 0)}{' '}
							indirim
						</span>
					</div>
				)}
				<p className='text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-500'>
					{effectivePrice.toLocaleString('tr-TR', {
						minimumFractionDigits: 2,
						maximumFractionDigits: 2,
					})}{' '}
					TL
				</p>
			</div>

			{/* View & like stats */}
			<div className='flex items-center gap-4 text-sm text-muted mb-6'>
				<div className='flex items-center gap-1'>
					<svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							strokeWidth={2}
							d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
						/>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							strokeWidth={2}
							d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
						/>
					</svg>
					<span>
						{listing.viewCount || 0} {t('product.views')}
					</span>
				</div>
				<div className='flex items-center gap-1'>
					<HeartIcon className='w-4 h-4' />
					<span>
						{listing.likeCount || 0} {t('product.likes')}
					</span>
				</div>
			</div>

			{/* Quick info */}
			<div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3 sm:gap-4 sm:p-5 bg-surface-elevated rounded shadow-sm border border-border-subtle mb-4 sm:mb-6'>
				{listing.brand && (
					<div className='text-center p-2'>
						<p className='text-xs font-medium text-muted uppercase tracking-wide mb-1'>
							{t('product.brand')}
						</p>
						<Link
							href={`/brands/${listing.brand.slug}`}
							className='font-semibold text-heading hover:text-primary-500 transition-colors'>
							{listing.brand.name}
						</Link>
					</div>
				)}
				<div className='text-center p-2'>
					<p className='text-xs font-medium text-muted uppercase tracking-wide mb-1'>
						{t('product.scale')}
					</p>
					<p className='font-semibold text-heading'>
						{listing.scale ||
							listing.attributes?.find(
								(a: any) => a.group === 'Ölçek' || a.label === 'Ölçek',
							)?.value ||
							'—'}
					</p>
				</div>
				<div className='text-center p-2'>
					<p className='text-xs font-medium text-muted uppercase tracking-wide mb-1'>
						{locale === 'en' ? 'Material' : 'Malzeme'}
					</p>
					<p className='font-semibold text-heading'>
						{listing.material ||
							listing.attributes?.find(
								(a) => a.group === 'material' || a.group === 'Malzeme',
							)?.value ||
							'—'}
					</p>
				</div>
				{listing.manufacturer && (
					<div className='text-center p-2'>
						<p className='text-xs font-medium text-muted uppercase tracking-wide mb-1'>
							{locale === 'en' ? 'Manufacturer' : 'Üretici'}
						</p>
						<p className='font-semibold text-heading'>
							{listing.manufacturer.name}
						</p>
					</div>
				)}
				{listing.category && (
					<div className='text-center p-2'>
						<p className='text-xs font-medium text-muted uppercase tracking-wide mb-1'>
							{t('product.category')}
						</p>
						<p className='font-semibold text-heading'>{listing.category.name}</p>
					</div>
				)}
				{listing.condition && (
					<div className='text-center p-2'>
						<p className='text-xs font-medium text-muted uppercase tracking-wide mb-1'>
							{locale === 'en' ? 'Condition' : 'Durum'}
						</p>
						<p className='font-semibold text-heading'>
							{formatCondition(listing.condition, locale)}
						</p>
					</div>
				)}
				<div className='text-center p-2'>
					<p className='text-xs font-medium text-muted uppercase tracking-wide mb-1'>
						{locale === 'en' ? 'Year' : 'Yıl'}
					</p>
					<p className='font-semibold text-heading'>{listing.year ?? '—'}</p>
				</div>
				{((listing.availableQuantity !== undefined &&
					listing.availableQuantity !== null) ||
					(listing.quantity !== undefined && listing.quantity !== null)) && (
					<div className='text-center p-2'>
						<p className='text-xs font-medium text-muted uppercase tracking-wide mb-1'>
							{locale === 'en' ? 'Stock' : 'Stok'}
						</p>
						<p className='font-semibold text-heading'>
							{available === null || available === undefined
								? locale === 'en'
									? 'Unlimited'
									: 'Sınırsız'
								: available > 0
									? `${available} ${locale === 'en' ? 'available' : 'adet'}`
									: t('product.stockFinished')}
						</p>
					</div>
				)}
			</div>

			{/* Description + technical details */}
			<div className='bg-surface-elevated rounded p-6 shadow-sm border border-border-subtle mb-6'>
				<h2 className='text-base font-semibold text-heading mb-3 flex items-center gap-2'>
					<span className='w-1 h-5 bg-primary-500 rounded-sm' aria-hidden />
					{t('product.description')}
				</h2>
				<div className='prose prose-sm max-w-none text-muted whitespace-pre-line leading-relaxed'>
					{listing.description || t('product.noDescription')}
				</div>

				{(listing.attributes?.filter(
					(a) =>
						a.group !== 'scale' && a.group !== 'material' && a.group !== 'Malzeme',
				)?.length ?? 0) > 0 || listing.carModel ? (
					<div className='border-t pt-6 mt-6'>
						<h3 className='text-base font-semibold text-heading mb-3 flex items-center gap-2'>
							<span className='w-1 h-5 bg-info-500 rounded-sm' aria-hidden />
							{locale === 'en' ? 'Technical details' : 'Teknik özellikler'}
						</h3>
						<dl className='grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3'>
							{listing.carModel && (
								<>
									<dt className='text-sm text-muted'>Model</dt>
									<dd className='text-sm font-medium text-heading'>
										{listing.carModel.name}
									</dd>
								</>
							)}
							{listing.attributes
								?.filter(
									(attr) =>
										attr.group !== 'scale' &&
										attr.group !== 'material' &&
										attr.group !== 'Malzeme',
								)
								?.map((attr) => (
									<Fragment key={attr.id}>
										<dt className='text-sm text-muted'>{attr.label}</dt>
										<dd className='text-sm font-medium text-heading'>
											{attr.value}
										</dd>
									</Fragment>
								))}
						</dl>
					</div>
				) : null}
			</div>

			{/* Seller */}
			<SellerCard />

			{/* Status banner */}
			{listing.status && listing.status !== 'active' && (
				<div
					className={`rounded p-4 mb-4 ${
						listing.status === 'reserved'
							? 'bg-warning-50 border border-warning-200'
							: listing.status === 'sold'
								? 'bg-danger-50 border border-danger-200'
								: 'bg-surface border border-border'
					}`}>
					<div className='flex items-center gap-3'>
						<ExclamationTriangleIcon
							className={`w-6 h-6 ${
								listing.status === 'reserved'
									? 'text-warning-600'
									: listing.status === 'sold'
										? 'text-danger-600'
										: 'text-muted'
							}`}
						/>
						<div>
							<p
								className={`font-semibold ${
									listing.status === 'reserved'
										? 'text-warning-800'
										: listing.status === 'sold'
											? 'text-danger-800'
											: 'text-body'
								}`}>
								{listing.status === 'reserved' && t('product.statusReserved')}
								{listing.status === 'sold' && t('product.statusSold')}
								{listing.status === 'pending' && t('product.statusPending')}
								{listing.status === 'inactive' && t('product.statusInactive')}
								{listing.status === 'rejected' && t('product.statusRejected')}
								{listing.status === 'deleted' &&
									(locale === 'en' ? 'Removed' : 'Kaldırıldı')}
							</p>
							<p className='text-sm text-muted'>
								{listing.status === 'reserved' && t('product.statusReservedDesc')}
								{listing.status === 'sold' && t('product.statusSoldDesc')}
							</p>
						</div>
					</div>
				</div>
			)}

			{/* Action buttons */}
			<div className='space-y-3'>
				{isOwner && (
					<div className='bg-info-50 border border-info-200 rounded p-4 text-center'>
						<p className='text-info-800 font-medium'>
							{locale === 'en' ? 'This is your listing' : 'Bu sizin ilanınız'}
						</p>
						<div className='flex gap-2 justify-center mt-3'>
							<ButtonLink variant='secondary' href={`/listings/${listing.id}/edit`}>
								{locale === 'en' ? 'Edit Listing' : 'İlanı Düzenle'}
							</ButtonLink>
							<ButtonLink variant='secondary' href='/profile/listings'>
								{locale === 'en' ? 'My Listings' : 'İlanlarım'}
							</ButtonLink>
						</div>
					</div>
				)}

				{isOwner && (
					<>
						<ButtonLink
							href={`/listings/${listing.id}/edit`}
							className='w-full flex gap-2 py-4 text-lg'>
							<PencilIcon className='w-6 h-6' />
							{locale === 'en' ? 'Edit' : 'Düzenle'}
						</ButtonLink>

						{limits?.canCreateCollections && (
							<Button
								variant='secondary'
								onClick={handleOpenCollectionModal}
								className='w-full flex gap-2'>
								<FolderPlusIcon className='w-5 h-5' />
								{t('collection.addToCollection')}
							</Button>
						)}
					</>
				)}

				{/* Buy now — hidden for owner */}
				{!isOwner && (
					<Button
						onClick={handleBuyNow}
						disabled={listing.status !== 'active' || !hasStock}
						className='w-full gap-2 py-3 text-base sm:py-4 sm:text-lg'>
						<BoltIcon className='w-5 h-5 sm:w-6 sm:h-6' />
						{listing.status === 'sold'
							? t('product.sold')
							: listing.status === 'reserved'
								? t('product.reserved')
								: !hasStock
									? t('product.stockFinished')
									: t('product.buyNow')}
					</Button>
				)}

				{/* Secondary actions — hidden for owner */}
				{!isOwner && (
					<div className='grid grid-cols-2 sm:grid-cols-4 gap-2'>
						{isTradeAvailable && (
							<Button
								variant='secondary'
								onClick={() => {
									if (listing.status !== 'active') {
										toast.error(t('product.notForSale'));
										return;
									}
									if (!isAuthenticated) {
										requireAuth({
											title: t('auth.loginRequired'),
											message: t('trade.loginToTrade'),
											icon: (
												<ArrowsRightLeftIcon className='w-12 h-12 text-primary-500' />
											),
										});
										return;
									}
									if (!canTrade) {
										setShowTradeModal(true);
										return;
									}
									router.push(`/trades/new?listing=${listing.id}`);
								}}
								disabled={listing.status !== 'active'}
								className={`flex items-center justify-center gap-1.5 py-2.5 sm:py-3 text-sm ${
									listing.status === 'active'
										? 'btn-trade'
										: 'bg-border-subtle text-subtle cursor-not-allowed rounded'
								}`}>
								<ArrowsRightLeftIcon className='w-4 h-4 sm:w-5 sm:h-5' />
								<span className='truncate'>{t('product.trade')}</span>
							</Button>
						)}
						<Button
							variant='secondary'
							onClick={handleMakeOffer}
							disabled={listing.status !== 'active'}
							className='gap-1.5 py-2.5 sm:py-3'>
							<BoltIcon className='w-4 h-4 sm:w-5 sm:h-5' />
							<span className='truncate'>{t('product.makeOffer')}</span>
						</Button>
						<Button
							variant='secondary'
							onClick={handleCartToggle}
							// cartLoading: while the cart first loads the Add/Remove label isn't
							// settled yet → block that click so we don't fire the wrong action.
							disabled={isAddingToCart || cartLoading || listing.status !== 'active'}
							className={`gap-1.5 py-2.5 sm:py-3 ${
								isInCart ? 'bg-danger-50 border-danger-200 text-danger-600' : ''
							}`}>
							<ShoppingCartIcon className='w-4 h-4 sm:w-5 sm:h-5' />
							<span className='truncate'>
								{isAddingToCart
									? isInCart
										? t('product.removing')
										: t('product.adding')
									: isInCart
										? t('product.removeFromCart')
										: t('product.addToCart')}
							</span>
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
