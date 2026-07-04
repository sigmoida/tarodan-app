/** @format */

'use client';

import Link from 'next/link';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { Badge, SectionCard } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { useProfile } from '../_context/ProfileContext';

const TIER_EMOJI: Record<string, string> = {
	business: '👑 ',
	premium: '⭐ ',
	free: '🆓 ',
};

export default function MembershipCard() {
	const { t } = useTranslation();
	const { profile } = useProfile();

	const membership = profile?.membership;
	if (!membership) return null;

	const { tier } = membership;
	const type = tier.type;
	const isBusiness = type === 'business';
	const isPremium = type === 'premium';

	const cardClass = isBusiness
		? 'bg-gradient-to-br from-warning-50 to-primary-50 border-warning-200'
		: isPremium
			? 'bg-gradient-to-br from-primary-50 to-danger-50 border-primary-200'
			: 'bg-surface-elevated border-border-subtle';

	const iconBoxClass = isBusiness
		? 'bg-gradient-to-br from-warning-400 to-primary-500 text-inverted'
		: isPremium
			? 'bg-gradient-to-br from-primary-400 to-danger-500 text-inverted'
			: 'bg-surface-alt text-muted';

	const numberClass = isBusiness
		? 'text-warning-600'
		: isPremium
			? 'text-primary-600'
			: 'text-primary-500';

	const tileClass = type === 'free' ? 'bg-surface' : 'bg-surface-elevated/60';

	const listingLimit =
		type === 'free' ? tier.maxFreeListings : tier.maxTotalListings;

	return (
		<SectionCard className={`p-6 mb-6 ${cardClass}`}>
			<div className='flex items-center justify-between mb-5'>
				<div className='flex items-center gap-3'>
					<div className={`p-3 rounded ${iconBoxClass}`}>
						<SparklesIcon className='w-6 h-6' />
					</div>
					<div>
						<h3 className='font-bold text-heading text-lg'>
							{TIER_EMOJI[type] ?? ''}
							{tier.name}
						</h3>
						<p className='text-sm text-muted'>Mevcut planınız</p>
					</div>
				</div>
				{type === 'free' && (
					<Link
						href='/pricing'
						className='px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-inverted text-sm font-medium rounded transition-colors'>
						🚀 Premium&apos;a Yükselt
					</Link>
				)}
			</div>

			{/* Plan feature grid */}
			<div className='grid grid-cols-2 md:grid-cols-4 gap-3 mb-5'>
				<div className={`text-center p-4 rounded ${tileClass}`}>
					<p className={`text-2xl font-bold ${numberClass}`}>
						{listingLimit === -1 ? '∞' : listingLimit}
					</p>
					<p className='text-xs text-muted mt-1 font-medium'>
						{t('membership.listingsLimit')}
					</p>
				</div>
				<div className={`text-center p-4 rounded ${tileClass}`}>
					<p className={`text-2xl font-bold ${numberClass}`}>
						{tier.maxImagesPerListing}
					</p>
					<p className='text-xs text-muted mt-1 font-medium'>Fotoğraf / İlan</p>
				</div>
				<div className={`text-center p-4 rounded ${tileClass}`}>
					<p className={`text-2xl font-bold ${numberClass}`}>
						{tier.featuredListingSlots}
					</p>
					<p className='text-xs text-muted mt-1 font-medium'>
						{t('membership.featuredListings')}
					</p>
				</div>
				<div className={`text-center p-4 rounded ${tileClass}`}>
					<p className='text-2xl font-bold text-success-500'>
						%{(tier.commissionDiscount * 100).toFixed(0)}
					</p>
					<p className='text-xs text-muted mt-1 font-medium'>Komisyon İndirimi</p>
				</div>
			</div>

			{/* Feature chips */}
			<div className='flex flex-wrap gap-2'>
				<Badge variant={tier.canTrade ? 'success' : 'default'} size='sm'>
					{tier.canTrade ? '✓' : '✗'} Takas
				</Badge>
				<Badge
					variant={tier.canCreateCollections ? 'success' : 'default'}
					size='sm'>
					{tier.canCreateCollections ? '✓' : '✗'} Koleksiyon
				</Badge>
				<Badge variant={tier.isAdFree ? 'success' : 'default'} size='sm'>
					{tier.isAdFree ? '✓' : '✗'} Reklamsız
				</Badge>
			</div>
		</SectionCard>
	);
}
