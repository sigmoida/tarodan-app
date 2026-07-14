/** @format */

'use client';

import Link from 'next/link';
import { SectionCard } from '@/components/ui';
import UserAvatar from '@/components/UserAvatar';
import { useLocale, useTranslations } from "next-intl";
import type { OrderDetail } from '../_lib/types';

/** Karşı taraf kartı: alıcı görünümünde satıcı, satıcı görünümünde alıcı. */
export default function PartyCard({ order }: { order: OrderDetail }) {
	const locale = useLocale();
	const party = order.isBuyer ? order.seller : order.buyer;

	return (
		<SectionCard
			title={
				order.isBuyer
					? locale === 'en'
						? 'Seller'
						: 'Satıcı'
					: locale === 'en'
						? 'Buyer'
						: 'Alıcı'
			}>
			<Link
				href={`/seller/${party.id}`}
				className='flex items-center gap-3 hover:bg-surface -mx-2 px-2 py-2 rounded-lg transition-colors'>
				<UserAvatar displayName={party.displayName} avatarUrl={party.avatarUrl} size='md' />
				<div>
					<p className='font-medium text-heading'>{party.displayName}</p>
					<p className='text-sm text-muted'>
						{locale === 'en' ? 'View Profile' : 'Profili Gör'}
					</p>
				</div>
			</Link>
		</SectionCard>
	);
}
