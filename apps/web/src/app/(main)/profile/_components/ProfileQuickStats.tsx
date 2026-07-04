/** @format */

'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n';
import { useProfile } from '../_context/ProfileContext';
import { buildQuickActions, type QuickStatKey } from '../_lib/menu';

export default function ProfileQuickStats() {
	const { t } = useTranslation();
	const { profile, wishlistCount, unreadMessagesCount } = useProfile();

	const values: Record<QuickStatKey, number> = {
		listings: profile?.stats?.productsCount ?? 0,
		orders: profile?.stats?.ordersCount ?? 0,
		favorites: wishlistCount,
		messages: unreadMessagesCount,
	};

	return (
		<div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-6'>
			{buildQuickActions(t).map((action) => (
				<Link
					key={action.label}
					href={action.href}
					className='bg-surface-elevated rounded p-5 shadow-sm hover:shadow-md transition-all border border-border-subtle group'>
					<div className='flex items-center gap-3'>
						<div className='p-2 rounded bg-surface group-hover:bg-primary-50 transition-colors'>
							<action.icon className={`w-6 h-6 ${action.color}`} />
						</div>
						<div>
							<p className='text-2xl font-bold text-heading'>
								{values[action.statKey]}
							</p>
							<p className='text-sm text-muted'>{action.label}</p>
						</div>
					</div>
				</Link>
			))}
		</div>
	);
}
