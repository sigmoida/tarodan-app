/** @format */

'use client';

import Link from 'next/link';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { useListingDetail } from '../_context/ListingDetailContext';

export default function TradePremiumModal() {
	const { t, showTradeModal, setShowTradeModal } = useListingDetail();

	if (!showTradeModal) return null;

	return (
		<div className='fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4'>
			<div className='bg-surface-elevated rounded max-w-md w-full p-6 text-center'>
				<div className='w-16 h-16 bg-warning-100 rounded-full flex items-center justify-center mx-auto mb-4'>
					<ArrowsRightLeftIcon className='w-8 h-8 text-warning-600' />
				</div>
				<h2 className='text-xl font-bold text-heading mb-2'>
					{t('trade.premiumRequired')}
				</h2>
				<p className='text-muted mb-6'>{t('trade.premiumRequiredDesc')}</p>
				<div className='flex flex-col sm:flex-row gap-3'>
					<Button
						variant='secondary'
						onClick={() => setShowTradeModal(false)}
						className='flex-1 px-4 py-3 text-body rounded font-medium hover:bg-surface'>
						{t('common.cancel')}
					</Button>
					<Link
						href='/membership'
						className='flex-1 px-4 py-3 bg-primary-500 text-inverted rounded font-medium hover:bg-primary-600 transition-colors text-center'>
						{t('membership.upgrade')}
					</Link>
				</div>
			</div>
		</div>
	);
}
