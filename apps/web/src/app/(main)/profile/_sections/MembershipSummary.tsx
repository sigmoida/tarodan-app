/** @format */

'use client';

import {
	ShoppingBagIcon,
	TagIcon,
	ArrowsRightLeftIcon,
	HeartIcon,
} from '@heroicons/react/24/outline';
import { Badge, type BadgeVariant } from '@tarodan/ui';
import UserAvatar from '@/components/UserAvatar';
import { MetricCard } from '@/components/ui';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { useProfile } from '../_context/ProfileContext';

const TIER_VARIANT: Record<string, BadgeVariant> = {
	business: 'warning',
	premium: 'primary',
	free: 'secondary',
};

/**
 * The account overview card at the top of the profile dashboard: identity + tier
 * badge + a "manage membership" shortcut + a metrics grid (the shared MetricCard,
 * so it matches the offers / discounts metric rows). Reads the shared overview
 * query via ProfileContext so it renders instantly alongside the sections below.
 */
export default function MembershipSummary() {
	const { profile, wishlistCount } = useProfile();

	const tierType = profile?.membership?.tier.type ?? profile?.membershipTier ?? 'free';
	const tierName = profile?.membership?.tier.name ?? 'Ücretsiz';
	const stats = profile?.stats;

	return (
		<div className='rounded-lg border border-border bg-surface-elevated p-5 md:p-6'>
			<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
				<div className='flex items-center gap-4'>
					<UserAvatar
						displayName={profile?.displayName || profile?.email}
						avatarUrl={profile?.avatarUrl}
						size='lg'
						ring
						className='flex-shrink-0'
					/>
					<div className='min-w-0'>
						<div className='flex flex-wrap items-center gap-2'>
							<h2 className='truncate text-xl font-bold text-heading'>
								{profile?.displayName || '—'}
							</h2>
							<Badge variant={TIER_VARIANT[tierType] ?? 'secondary'} size='sm'>
								{tierName}
							</Badge>
							{profile?.isVerified && (
								<Badge variant='success' size='sm'>
									✓ Onaylı
								</Badge>
							)}
						</div>
						<p className='truncate text-sm text-muted'>{profile?.email}</p>
						{stats && stats.rating > 0 && (
							<p className='mt-0.5 text-xs text-subtle'>
								★ {stats.rating.toFixed(1)} · {stats.reviewsCount} değerlendirme
							</p>
						)}
					</div>
				</div>

				<ButtonLink
					href='/membership'
					variant='outline'
					size='sm'
					className='shrink-0'>
					Üyeliği Yönet
				</ButtonLink>
			</div>

			<div className='mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4'>
				<MetricCard
					icon={ShoppingBagIcon}
					label='İlan'
					value={stats?.productsCount ?? 0}
					accent='text-primary-600'
				/>
				<MetricCard
					icon={TagIcon}
					label='Sipariş'
					value={stats?.ordersCount ?? 0}
					accent='text-info-600'
				/>
				<MetricCard
					icon={ArrowsRightLeftIcon}
					label='Takas'
					value={stats?.tradesCount ?? 0}
					accent='text-success-600'
				/>
				<MetricCard
					icon={HeartIcon}
					label='Favori'
					value={wishlistCount}
					accent='text-danger-600'
				/>
			</div>
		</div>
	);
}
