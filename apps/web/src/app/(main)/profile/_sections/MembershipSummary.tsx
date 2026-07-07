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
import { useProfile } from '../_context/ProfileContext';

const TIER_VARIANT: Record<string, BadgeVariant> = {
	business: 'warning',
	premium: 'primary',
	free: 'secondary',
};

function MetricBox({
	icon: Icon,
	value,
	label,
}: {
	icon: typeof ShoppingBagIcon;
	value: number;
	label: string;
}) {
	return (
		<div className='flex flex-col items-center gap-1 rounded-lg bg-surface p-4 text-center'>
			<Icon className='h-6 w-6 text-primary-500' />
			<span className='text-2xl font-bold text-heading'>{value}</span>
			<span className='text-xs text-muted'>{label}</span>
		</div>
	);
}

/**
 * The account overview card at the top of the profile dashboard: identity + tier
 * badge + a metrics grid. Reads the shared overview query via ProfileContext so
 * it renders instantly alongside the independent section cards below.
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
			</div>

			<div className='mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4'>
				<MetricBox icon={ShoppingBagIcon} value={stats?.productsCount ?? 0} label='İlan' />
				<MetricBox icon={TagIcon} value={stats?.ordersCount ?? 0} label='Sipariş' />
				<MetricBox icon={ArrowsRightLeftIcon} value={stats?.tradesCount ?? 0} label='Takas' />
				<MetricBox icon={HeartIcon} value={wishlistCount} label='Favori' />
			</div>
		</div>
	);
}
