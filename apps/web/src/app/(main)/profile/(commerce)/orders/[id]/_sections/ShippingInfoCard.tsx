/** @format */

'use client';

import { TruckIcon } from '@heroicons/react/24/outline';
import { SectionCard } from '@/components/ui';
import { useLocale, useTranslations } from "next-intl";
import type { OrderDetail } from '../_lib/types';

const SHIPPED_ORDER_STATUSES = [
	'shipped',
	'delivered',
	'awaiting_buyer_confirmation',
	'completed',
];

const statusLabelMap: Record<string, { tr: string; en: string }> = {
	pending: { tr: 'Satıcı Hazırlıyor', en: 'Preparing' },
	label_created: { tr: 'Kargo Etiketi Oluşturuldu', en: 'Label Created' },
	picked_up: { tr: 'Şubeye Teslim Edildi', en: 'Picked Up' },
	in_transit: { tr: 'Yolda', en: 'In Transit' },
	at_delivery_branch: { tr: 'Dağıtım Şubesinde', en: 'At Delivery Branch' },
	out_for_delivery: { tr: 'Dağıtıma Çıktı', en: 'Out For Delivery' },
	delivered: { tr: 'Teslim Edildi', en: 'Delivered' },
	failed: { tr: 'Teslim Edilemedi', en: 'Failed' },
	return_in_progress: { tr: 'İade Yolda', en: 'Return In Progress' },
	returned: { tr: 'İade Tamamlandı', en: 'Returned' },
	cancelled: { tr: 'İptal Edildi', en: 'Cancelled' },
};

/**
 * Kargo bilgileri — SADECE gerçek gönderi varken: shipment + dolu trackingNumber +
 * sipariş durumu kargolanmış/teslim. İptal ya da teslim öncesi durumlarda gizli.
 */
export default function ShippingInfoCard({ order }: { order: OrderDetail }) {
	const locale = useLocale();

	const isIptalOrder = order.cancellationType === 'iptal';
	if (
		!order.shipment ||
		!order.shipment.trackingNumber ||
		isIptalOrder ||
		order.status === 'cancelled' ||
		!SHIPPED_ORDER_STATUSES.includes(order.status)
	) {
		return null;
	}

	// Sipariş durumu (order.status) admin tarafından elle ileri alındığında shipment.status
	// geride kalabiliyor. Bu durumda sipariş durumunu gerçeğin kaynağı kabul edip etkin
	// (effective) bir kargo durumu türetiyoruz.
	const orderShipped = SHIPPED_ORDER_STATUSES.includes(order.status);
	const orderDelivered = ['delivered', 'awaiting_buyer_confirmation', 'completed'].includes(
		order.status,
	);

	let s = order.shipment.status;
	const isReturnFlow = s === 'return_in_progress' || s === 'returned';
	const orderCancelled = order.status === 'cancelled' || order.status === 'refunded';
	if (orderCancelled && !isReturnFlow) {
		s = 'cancelled';
	} else if (orderDelivered && s !== 'delivered' && !isReturnFlow) {
		s = 'delivered';
	} else if (orderShipped && (s === 'pending' || s === 'label_created')) {
		s = 'in_transit';
	}

	const isPending = s === 'pending';
	const isCancelled = s === 'cancelled' || s === 'failed';
	const isShippedActive =
		s === 'label_created' ||
		s === 'picked_up' ||
		s === 'in_transit' ||
		s === 'at_delivery_branch' ||
		s === 'out_for_delivery';
	const isDelivered = s === 'delivered';

	// Satıcı için pending durumunda kartı tamamen gizle —
	// 'Kargo Referans Numarası' aksiyon kartı zaten görünüyor.
	if (isPending && order.isSeller && !order.isBuyer) {
		return null;
	}

	const statusLbl = statusLabelMap[s] ?? { tr: s, en: s };

	return (
		<SectionCard
			title={
				<span className='flex items-center gap-2'>
					<TruckIcon className='w-5 h-5' />
					{locale === 'en' ? 'Shipping Information' : 'Kargo Bilgileri'}
				</span>
			}>
			{isPending && order.isBuyer && (
				<div className='bg-info-50 border border-info-200 rounded-lg p-4 text-sm text-info-800'>
					{locale === 'en'
						? "The seller is preparing your package. Tracking details will appear here once it's handed over to Sürat."
						: 'Satıcı paketinizi hazırlıyor. Sürat şubesine teslim edildiği anda takip bilgileri burada görünecek.'}
				</div>
			)}

			{isCancelled && (
				<div className='bg-danger-50 border border-danger-200 rounded-lg p-4 text-sm text-danger-800'>
					{locale === 'en'
						? 'This shipment has been cancelled.'
						: 'Bu kargo iptal edildi.'}
				</div>
			)}

			{(isShippedActive || isDelivered) && (
				<div className='space-y-3'>
					<div className='flex justify-between'>
						<span className='text-muted'>
							{locale === 'en' ? 'Carrier:' : 'Kargo Firması:'}
						</span>
						<span className='font-medium'>
							{order.shipment.provider === 'surat' ? 'Sürat Kargo' : order.shipment.provider}
						</span>
					</div>
					{order.shipment.trackingNumber && (
						<div className='flex justify-between items-center'>
							<span className='text-muted'>
								{locale === 'en' ? 'Tracking Number:' : 'Takip Numarası:'}
							</span>
							<span className='font-mono bg-surface-alt px-2 py-1 rounded text-sm'>
								{order.shipment.trackingNumber}
							</span>
						</div>
					)}
					<div className='flex justify-between'>
						<span className='text-muted'>{locale === 'en' ? 'Status:' : 'Durum:'}</span>
						<span
							className={`font-medium ${isDelivered ? 'text-success-700' : 'text-info-700'}`}>
							{locale === 'en' ? statusLbl.en : statusLbl.tr}
						</span>
					</div>
					{order.isBuyer && order.shipment.trackingNumber && (
						<div className='flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-border-default'>
							{order.shipment.provider === 'surat' && (
								<a
									href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(order.shipment.trackingNumber)}`}
									target='_blank'
									rel='noopener noreferrer'
									className='inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-inverted rounded-lg text-sm font-medium transition-colors'>
									<TruckIcon className='w-4 h-4' />
									{locale === 'en' ? 'Track on Sürat' : "Sürat'ta Takip Et"}
								</a>
							)}
						</div>
					)}
				</div>
			)}
		</SectionCard>
	);
}
