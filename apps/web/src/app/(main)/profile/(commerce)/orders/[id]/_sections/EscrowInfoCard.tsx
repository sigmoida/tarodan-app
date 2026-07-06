/** @format */

'use client';

import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { computePayoutDate, isMembershipOrder, type OrderDetail } from '../_lib/types';

/**
 * Escrow bilgisi (teslim sonrası) — alıcı onayı artık payout tetiklemez.
 * Satıcıya ödeme: teslim + 14 gün iade penceresi + 1 gün grace ile otomatik.
 */
export default function EscrowInfoCard({ order }: { order: OrderDetail }) {
	const { locale } = useTranslation();

	if (
		!order.isBuyer ||
		!['delivered', 'awaiting_buyer_confirmation'].includes(order.status) ||
		isMembershipOrder(order)
	) {
		return null;
	}

	const payoutDate = computePayoutDate(order);

	return (
		<div className='bg-info-50 border border-info-200 rounded-xl shadow-sm p-6'>
			<h2 className='text-lg font-semibold text-info-800 mb-2 flex items-center gap-2'>
				<ShieldCheckIcon className='w-5 h-5' />
				{locale === 'en' ? 'Delivered' : 'Teslim Edildi'}
			</h2>
			<p className='text-sm text-info-800'>
				{payoutDate
					? locale === 'en'
						? `Payment to the seller is released 14 days after delivery (on ${payoutDate.toLocaleDateString(
								'en-US',
								{ year: 'numeric', month: 'long', day: 'numeric' },
							)}). You have until then to request a refund.`
						: `Satıcıya ödeme teslimden 14 gün sonra serbest bırakılır (${payoutDate.toLocaleDateString(
								'tr-TR',
								{ year: 'numeric', month: 'long', day: 'numeric' },
							)}). O tarihe kadar iade talep edebilirsiniz.`
					: locale === 'en'
						? 'Payment to the seller is released 14 days after delivery. You can request a refund during this window.'
						: 'Satıcıya ödeme teslimden 14 gün sonra serbest bırakılır. Bu süre içinde iade talep edebilirsiniz.'}
			</p>
			{order.activeRefundRequest && (
				<p className='text-sm text-info-800 mt-2 font-medium'>
					{locale === 'en'
						? 'Payment is on hold until the open refund request is resolved.'
						: 'Açık iade talebiniz sonuçlanana kadar ödeme bekletiliyor.'}
				</p>
			)}
		</div>
	);
}
