/** @format */

'use client';

import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowUturnLeftIcon, TruckIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { useLocale, useTranslations } from "next-intl";
import type { OrderDetail } from '../_lib/types';

const labelMap: Record<string, { tr: string; en: string }> = {
	pending_review: { tr: 'Talep İnceleniyor', en: 'Under Review' },
	approved: { tr: 'Onaylandı, İşleniyor', en: 'Approved, Processing' },
	wait_for_delivery: {
		tr: 'Ürün Tesliminden Sonra İade Açılacak',
		en: 'Awaiting Delivery',
	},
	return_shipment_open: { tr: 'İade Kargonuz Hazır', en: 'Return Shipment Ready' },
	return_in_transit: { tr: 'İade Yolda', en: 'Return In Transit' },
	return_delivered: {
		tr: 'Satıcıya Ulaştı, Para İadesi Yapılıyor',
		en: 'Delivered, Refund Processing',
	},
	refunded: { tr: 'İade Tamamlandı', en: 'Refunded' },
	disputed: { tr: 'İtirazlı (İnceleniyor)', en: 'Under Dispute' },
};

export default function RefundRequestBanner({ order }: { order: OrderDetail }) {
	const locale = useLocale();
	const rr = order.activeRefundRequest;
	if (!rr) return null;

	const isRefunded = rr.status === 'refunded';
	const isReturnReady =
		rr.status === 'return_shipment_open' && !!rr.returnTrackingNumber;
	const lbl = labelMap[rr.status] ?? { tr: rr.status, en: rr.status };

	return (
		<div
			className={`rounded-xl shadow-sm p-6 border-2 ${
				isRefunded ? 'bg-success-50 border-success-200' : 'bg-info-50 border-info-200'
			}`}>
			<div className='flex items-start justify-between gap-3 mb-3'>
				<div>
					<h2
						className={`text-lg font-semibold flex items-center gap-2 ${
							isRefunded ? 'text-success-800' : 'text-info-800'
						}`}>
						<ArrowUturnLeftIcon className='w-5 h-5' />
						{locale === 'en' ? 'Refund Request' : 'İade Talebi'}
					</h2>
					<p className='text-sm text-muted mt-1'>
						{rr.refundNumber} ·{' '}
						{new Date(rr.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR')}
					</p>
				</div>
				<span
					className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${
						isRefunded
							? 'bg-success-100 text-success-800 border-success-300'
							: 'bg-info-100 text-info-800 border-info-300'
					}`}>
					{locale === 'en' ? lbl.en : lbl.tr}
				</span>
			</div>

			{isReturnReady && (
				<div className='bg-surface-elevated rounded-lg p-4 mb-3'>
					<p className='text-sm text-body mb-2'>
						{order.isBuyer
							? locale === 'en'
								? 'Drop the package off at any Sürat branch with this number:'
								: 'Bu numarayı paketle birlikte herhangi bir Sürat şubesine bırakın:'
							: locale === 'en'
								? 'The buyer has been given a return label. Package will be sent to your address.'
								: 'Alıcıya iade kargo etiketi verildi. Paket adresinize gönderilecek.'}
					</p>
					<div className='flex items-center justify-between gap-3'>
						<span className='font-mono text-lg font-bold text-heading break-all'>
							{rr.returnTrackingNumber}
						</span>
						<Button
							type='button'
							variant='ghost'
							onClick={() => {
								navigator.clipboard.writeText(rr.returnTrackingNumber!);
								toast.success(locale === 'en' ? 'Copied' : 'Kopyalandı');
							}}
							className='h-auto p-0 text-sm text-primary-600 hover:text-primary-700 font-medium'>
							{locale === 'en' ? 'Copy' : 'Kopyala'}
						</Button>
					</div>
				</div>
			)}

			{rr.returnProvider === 'surat' && rr.returnTrackingNumber && (
				<a
					href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(rr.returnTrackingNumber)}`}
					target='_blank'
					rel='noopener noreferrer'
					className='inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium mr-4'>
					<TruckIcon className='w-4 h-4' />
					{locale === 'en' ? 'Track Return' : 'İade Kargosunu Takip Et'}
				</a>
			)}

			<Link
				href={`/profile/refund-requests/${rr.id}`}
				className='inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium'>
				{locale === 'en' ? 'View Details →' : 'Detayı Gör →'}
			</Link>
		</div>
	);
}
