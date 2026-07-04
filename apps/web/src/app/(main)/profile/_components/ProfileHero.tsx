/** @format */

'use client';

import Link from 'next/link';
import { PencilSquareIcon } from '@heroicons/react/24/outline';
import { Badge } from '@tarodan/ui';
import UserAvatar from '@/components/UserAvatar';
import { useTranslation } from '@/i18n';
import { useProfile } from '../_context/ProfileContext';

const TIER_EMOJI: Record<string, string> = {
	business: '👑',
	premium: '⭐',
	free: '🆓',
};

const TIER_BADGE_CLASS: Record<string, string> = {
	business:
		'bg-gradient-to-r from-warning-400 to-primary-400 text-inverted shadow-md',
	premium:
		'bg-gradient-to-r from-primary-400 to-danger-400 text-inverted shadow-md',
	free: 'bg-surface-elevated/25 backdrop-blur-sm text-inverted',
};

export default function ProfileHero() {
	const { t } = useTranslation();
	const { profile } = useProfile();

	if (!profile) return null;

	const tierType = profile.membership?.tier.type ?? 'free';

	return (
		<div className='flex flex-col md:flex-row items-start md:items-center gap-6'>
			<div className='relative flex-shrink-0'>
				<UserAvatar
					displayName={profile.displayName}
					avatarUrl={profile.avatarUrl}
					size='xl'
					ring
					className='bg-surface-elevated text-primary-500 shadow-lg'
				/>
			</div>

			<div className='flex-1 text-inverted min-w-0'>
				<div className='flex flex-wrap items-center gap-2 md:gap-3 mb-2'>
					<h1 className='text-2xl md:text-3xl font-bold truncate'>
						{profile.displayName}
					</h1>
					{profile.isVerified && (
						<Badge variant='success' size='sm'>
							✓ {t('common.approved')}
						</Badge>
					)}
				</div>

				{profile.membership && (
					<div className='mb-3'>
						<Badge
							size='md'
							className={
								TIER_BADGE_CLASS[tierType] ?? TIER_BADGE_CLASS.free
							}>
							{TIER_EMOJI[tierType] && (
								<span className='mr-1'>{TIER_EMOJI[tierType]}</span>
							)}
							{profile.membership.tier.name}
						</Badge>
					</div>
				)}

				{profile.isPremium && typeof profile.trustScore === 'number' && (
					<div className='mb-3 flex items-center gap-2 flex-wrap'>
						<Badge variant='warning' size='md' className='shadow-md'>
							🛡️ Güven Skoru {profile.trustScore}/100
							{profile.trustLevel && (
								<span className='font-medium'>&nbsp;· {profile.trustLevel}</span>
							)}
						</Badge>
					</div>
				)}

				<p className='text-primary-100'>{profile.email}</p>
				<p className='text-primary-200 text-sm mt-1'>
					{t('profile.memberSince')}:{' '}
					{new Date(profile.createdAt).toLocaleDateString('tr-TR')}
				</p>
				<div className='inline-flex items-center gap-1.5 mt-2'>
					<span className='text-inverted font-semibold'>
						{profile.stats?.followersCount ?? 0}
					</span>
					<span className='text-primary-200 text-sm'>
						{t('profile.followers')}
					</span>
				</div>

				{profile.stats && profile.stats.rating > 0 && (
					<div className='flex items-center gap-2 mt-2'>
						<div className='flex text-warning-300'>
							{[1, 2, 3, 4, 5].map((star) => (
								<svg
									key={star}
									className={`w-4 h-4 ${star <= (profile.stats?.rating ?? 0) ? 'fill-current' : 'text-inverted/30'}`}
									viewBox='0 0 20 20'>
									<path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
								</svg>
							))}
						</div>
						<span className='text-inverted font-medium'>
							{profile.stats.rating.toFixed(1)}
						</span>
						<span className='text-primary-200 text-sm'>
							({profile.stats.reviewsCount} değerlendirme)
						</span>
					</div>
				)}
			</div>

			<Link
				href='/profile/edit'
				className='hidden md:flex items-center gap-2 px-4 py-2 bg-surface-elevated/20 hover:bg-surface-elevated/30 rounded text-inverted text-sm font-medium transition-colors flex-shrink-0'>
				<PencilSquareIcon className='w-5 h-5' />
				<span>{t('profile.editProfile')}</span>
			</Link>
		</div>
	);
}
