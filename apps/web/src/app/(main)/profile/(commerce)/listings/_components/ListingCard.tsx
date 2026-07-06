/** @format */

'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
	PencilIcon,
	TrashIcon,
	EyeIcon,
	TruckIcon,
	UserIcon,
	CurrencyDollarIcon,
	CalendarDaysIcon,
	RocketLaunchIcon,
} from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { Badge, Button } from '@tarodan/ui';
import OptimizedImage from '@/components/OptimizedImage';
import { ButtonLink } from '@/components/ui/ButtonLink';
import {
	getProductEffectivePrice,
	isProductOnSaleDisplay,
	getProductOriginalPriceForDisplay,
} from '@/lib/productPrice';
import { getListingImage, formatTL, type EstimatedNet, type Listing } from '../_lib/types';
import { getListingStatus } from '../_lib/status';

const VIEWABLE = ['active', 'sold', 'reserved', 'inactive'];

interface ListingCardProps {
	listing: Listing;
	index: number;
	estimatedNet?: EstimatedNet;
	isDeleting: boolean;
	onDelete: (id: string) => void;
	onBoost: (listing: Listing) => void;
}

export default function ListingCard({
	listing,
	index,
	estimatedNet,
	isDeleting,
	onDelete,
	onBoost,
}: ListingCardProps) {
	const status = getListingStatus(listing.status);
	const StatusIcon = status.icon;
	const viewable = VIEWABLE.includes(listing.status);
	const onSale = isProductOnSaleDisplay(listing);

	const canEdit = ['active', 'pending', 'inactive'].includes(listing.status);
	const relist =
		(listing.status === 'sold' && !listing.orderId) ||
		listing.status === 'inactive';

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: index * 0.05 }}
			className='group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated transition-shadow hover:shadow-lg'>
			{/* Media */}
			<div className='relative aspect-square bg-surface-alt'>
				<OptimizedImage
					src={getListingImage(listing)}
					alt={listing.title}
					fill
					className='object-cover'
					fallbackSrc='https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün'
					logContext={{ listingId: listing.id, page: 'profile-listings' }}
				/>
				<div className='absolute left-2 top-2'>
					<Badge
						variant={status.variant}
						size='sm'
						icon={<StatusIcon className='h-3 w-3' />}>
						{status.label}
					</Badge>
				</div>
				{listing.isBoosted && (
					<div className='absolute right-2 top-2'>
						<Badge
							variant='warning'
							size='sm'
							icon={<RocketLaunchIcon className='h-3 w-3' />}>
							Öne Çıkan
						</Badge>
					</div>
				)}
			</div>

			{/* Body */}
			<div className='flex flex-1 flex-col p-4'>
				{viewable ? (
					<Link
						href={`/listings/${listing.id}`}
						className='mb-2 line-clamp-2 font-semibold text-heading after:absolute after:inset-0 hover:text-primary-600'>
						{listing.title}
					</Link>
				) : (
					<h3 className='mb-2 line-clamp-2 font-semibold text-heading'>
						{listing.title}
					</h3>
				)}

				<div className='mb-3'>
					{onSale && (
						<div className='mb-0.5 flex items-center gap-2'>
							<span className='text-sm text-subtle line-through'>
								{formatTL(getProductOriginalPriceForDisplay(listing))}
							</span>
							<Badge variant='danger' size='sm'>
								İndirim
							</Badge>
						</div>
					)}
					<p className='text-xl font-bold text-primary-500'>
						{formatTL(getProductEffectivePrice(listing))}
					</p>
					{listing.status !== 'sold' && estimatedNet != null && (
						<p className='mt-0.5 text-xs text-success-600'>
							Tahmini net kazanç: {formatTL(estimatedNet.sellerNetAmount)}
						</p>
					)}
				</div>

				<div className='mb-3 flex items-center justify-between text-sm text-muted'>
					<span>{new Date(listing.createdAt).toLocaleDateString('tr-TR')}</span>
					<div className='flex items-center gap-3'>
						{listing.rating &&
							listing.rating.average !== null &&
							listing.rating.count > 0 && (
								<span className='flex items-center gap-1'>
									<StarIcon className='h-4 w-4 text-warning-400' />
									<span className='text-sm font-semibold text-heading'>
										{listing.rating.average.toFixed(1)}
									</span>
									<span className='text-xs text-subtle'>
										({listing.rating.count})
									</span>
								</span>
							)}
						{listing.viewCount !== undefined && (
							<span className='flex items-center gap-1'>
								<EyeIcon className='h-4 w-4' />
								{listing.viewCount}
							</span>
						)}
					</div>
				</div>

				{listing.status === 'sold' && (
					<div className='mb-3 space-y-1.5 rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm'>
						{listing.soldAt && (
							<div className='flex items-center gap-2 text-muted'>
								<CalendarDaysIcon className='h-4 w-4 text-primary-500' />
								<span>
									Satış: {new Date(listing.soldAt).toLocaleDateString('tr-TR')}
								</span>
							</div>
						)}
						{listing.buyer && (
							<div className='flex items-center gap-2 text-muted'>
								<UserIcon className='h-4 w-4 text-primary-500' />
								<span>Alıcı: @{listing.buyer.displayName}</span>
							</div>
						)}
						{listing.soldPrice != null && (
							<div className='flex items-center gap-2 font-medium text-body'>
								<CurrencyDollarIcon className='h-4 w-4 text-success-600' />
								<span>{formatTL(listing.soldPrice)}</span>
							</div>
						)}
					</div>
				)}

				{/* Actions — above the card's stretched link */}
				<div className='relative z-10 mt-auto flex gap-2 pt-1'>
					{canEdit && (
						<ButtonLink
							href={`/listings/${listing.id}/edit`}
							variant='secondary'
							size='sm'
							className='flex-1 gap-1'>
							<PencilIcon className='h-4 w-4' />
							Düzenle
						</ButtonLink>
					)}
					{listing.status === 'active' && (
						<Button
							variant='warning'
							size='sm'
							onClick={() => onBoost(listing)}
							className='flex-1 gap-1'>
							<RocketLaunchIcon className='h-4 w-4' />
							{listing.isBoosted ? 'Süre Ekle' : 'Öne Çıkar'}
						</Button>
					)}
					{listing.status === 'sold' && listing.orderId && (
						<ButtonLink
							href={`/profile/orders?highlight=${listing.orderId}`}
							size='sm'
							className='flex-1 gap-1'>
							<TruckIcon className='h-4 w-4' />
							Sipariş Detayı
						</ButtonLink>
					)}
					{relist && (
						<ButtonLink
							href={`/listings/${listing.id}/edit`}
							variant='warning'
							size='sm'
							className='flex-1 gap-1'>
							Yeniden Satışa Aç
						</ButtonLink>
					)}
					{listing.status === 'rejected' && (
						<Button
							variant='danger'
							size='sm'
							className='flex-1 gap-1'
							onClick={() => onDelete(listing.id)}
							disabled={isDeleting}>
							<TrashIcon className='h-4 w-4' />
							{isDeleting ? 'Siliniyor...' : 'Sil'}
						</Button>
					)}
				</div>
			</div>
		</motion.div>
	);
}
