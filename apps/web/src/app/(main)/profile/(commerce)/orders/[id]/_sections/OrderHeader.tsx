/** @format */

'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { StatusBadge, orderStatusConfig } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import { getOrderStatusLabel, type OrderDetail } from '../_lib/types';

export default function OrderHeader({ order }: { order: OrderDetail }) {
	const { locale } = useTranslation();

	// Kargo öncesi iptalde status para akışı için 'refunded' olabilir; kullanıcıya
	// "İade Edildi" değil "İptal Edildi" göster. Açık iade varsa "İade Sürecinde".
	const isIptalOrder = order.cancellationType === 'iptal';
	const hasActiveRefund = !!order.activeRefundRequest;
	const displayStatus = hasActiveRefund
		? 'refund_requested'
		: isIptalOrder
			? 'cancelled'
			: order.status;
	const statusLabel = hasActiveRefund
		? locale === 'en'
			? 'Refund in progress'
			: 'İade Sürecinde'
		: getOrderStatusLabel(displayStatus, locale);

	return (
		<div className='flex items-center gap-4 mb-8'>
			<Link
				href='/profile/orders'
				className='p-2 hover:bg-border-subtle rounded-lg transition-colors'>
				<ArrowLeftIcon className='w-6 h-6 text-muted' />
			</Link>
			<div className='flex-1'>
				<h1 className='text-2xl font-bold text-heading'>Sipariş #{order.orderNumber}</h1>
				<p className='text-sm text-muted'>
					{new Date(order.createdAt).toLocaleDateString('tr-TR', {
						year: 'numeric',
						month: 'long',
						day: 'numeric',
						hour: '2-digit',
						minute: '2-digit',
					})}
				</p>
			</div>
			<StatusBadge status={displayStatus} config={orderStatusConfig} label={statusLabel} />
		</div>
	);
}
