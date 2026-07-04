/** @format */

'use client';

import Link from 'next/link';
import {
	StarIcon,
	ChatBubbleLeftRightIcon,
	UserIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import UserAvatar from '@/components/UserAvatar';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { useListingDetail } from '../_context/ListingDetailContext';

export default function SellerCard() {
	const { t, locale, listing, isAuthenticated, isOwner, requireAuth } =
		useListingDetail();

	const seller = listing?.seller;
	if (!seller) return null;

	const openSellerAuthModal = () =>
		requireAuth({
			title: t('product.viewSellerProfile'),
			message: t('product.viewSellerProfileMsg'),
			icon: <UserIcon className='w-10 h-10 text-subtle' />,
		});

	const totalRatings = (seller as { totalRatings?: number }).totalRatings;

	return (
		<div className='bg-surface-elevated rounded p-4 mb-6'>
			<div className='flex items-center gap-4'>
				{isAuthenticated ? (
					<Link href={`/seller/${seller.id}`} className='flex-shrink-0'>
						<UserAvatar
							displayName={seller.displayName}
							avatarUrl={seller.avatarUrl}
							size='md'
							className='hover:ring-2 hover:ring-primary-500 transition-all'
						/>
					</Link>
				) : (
					<Button
						variant='secondary'
						onClick={openSellerAuthModal}
						className='flex-shrink-0'>
						<UserAvatar
							displayName={seller.displayName}
							avatarUrl={seller.avatarUrl}
							size='md'
							className='hover:ring-2 hover:ring-primary-500 transition-all cursor-pointer'
						/>
					</Button>
				)}
				<div className='flex-1'>
					{isAuthenticated ? (
						<Link
							href={`/seller/${seller.id}`}
							className='font-semibold hover:text-primary-500 transition-colors'>
							{seller.displayName || seller.username || t('product.seller')}
						</Link>
					) : (
						<Button
							variant='secondary'
							onClick={openSellerAuthModal}
							className='font-semibold hover:text-primary-500 transition-colors text-left cursor-pointer'>
							{seller.displayName || seller.username || t('product.seller')}
						</Button>
					)}
					{(seller as { isPremium?: boolean }).isPremium && (
						<span className='inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold bg-warning-100 text-warning-700 border border-warning-200'>
							<StarIcon className='w-3 h-3' />
							Premium
						</span>
					)}
					<div className='flex items-center gap-2 text-sm text-muted'>
						{seller.rating && seller.rating > 0 ? (
							<div className='flex items-center'>
								<StarIcon className='w-4 h-4 text-warning-400 mr-1' />
								{seller.rating.toFixed(1)}
								{totalRatings != null && totalRatings > 0 && (
									<span className='ml-1 text-subtle'>({totalRatings})</span>
								)}
							</div>
						) : (
							<div className='flex items-center text-subtle'>
								<StarIcon className='w-4 h-4 mr-1' />
								<span>
									{locale === 'en' ? 'No ratings yet' : 'Henüz değerlendirme yok'}
								</span>
							</div>
						)}
						<span>•</span>
						<span>
							{seller.listings_count || seller.productsCount || 0}{' '}
							{t('product.listings')}
						</span>
					</div>
				</div>
				{!isOwner &&
					(isAuthenticated ? (
						<ButtonLink
							variant='secondary'
							href={`/messages?user=${seller.id}&listing=${listing?.id}`}
							className='flex gap-2'>
							<ChatBubbleLeftRightIcon className='w-5 h-5' />
							{t('product.sendMessage')}
						</ButtonLink>
					) : (
						<Button
							variant='secondary'
							onClick={() =>
								requireAuth({
									title: t('product.sendMessageToSeller'),
									message: t('product.sendMessageToSellerMsg'),
									icon: (
										<ChatBubbleLeftRightIcon className='w-10 h-10 text-primary-500' />
									),
								})
							}
							className='gap-2'>
							<ChatBubbleLeftRightIcon className='w-5 h-5' />
							{t('product.sendMessage')}
						</Button>
					))}
			</div>
		</div>
	);
}
