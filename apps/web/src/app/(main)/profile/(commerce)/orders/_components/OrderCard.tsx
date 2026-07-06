/** @format */

'use client';

import Link from 'next/link';
import { StatusBadge, orderStatusConfig } from '@tarodan/ui';
import OptimizedImage from '@/components/OptimizedImage';
import { useTranslation } from '@/i18n';
import {
	formatTL,
	getOrderPrimary,
	hasVisibleShipment,
	orderAmount,
	sellerNetOf,
	type Order,
} from '../_lib/types';
import { getDisplayStatus } from '../_lib/status';
import OrderActions, { type OrderActionHandlers } from './OrderActions';

interface OrderCardProps {
	order: Order;
	actions: OrderActionHandlers;
	/** Compact = a grouped sub-item (smaller image + padding). */
	compact?: boolean;
}

export default function OrderCard({ order, actions, compact }: OrderCardProps) {
	const { t, locale } = useTranslation();
	const display = getDisplayStatus(order, t, locale);
	const { product, image } = getOrderPrimary(order);
	const net = sellerNetOf(order);

	return (
		<div
			className={`rounded-lg border border-border bg-surface-elevated ${
				compact ? 'p-4' : 'p-6'
			}`}>
			<div className={`flex items-start justify-between ${compact ? 'mb-3' : 'mb-4'}`}>
				<div>
					<p className='text-sm text-muted'>
						{t('order.orderNumber')} #{order.orderNumber}
					</p>
					<p className='text-sm text-subtle'>
						{new Date(order.createdAt).toLocaleDateString('tr-TR')}
					</p>
				</div>
				<StatusBadge
					status={display.status}
					config={orderStatusConfig}
					label={display.label}
				/>
			</div>

			{product ? (
				<div className='flex items-center gap-4'>
					<div
						className={`relative flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt ${
							compact ? 'h-12 w-12' : 'h-16 w-16'
						}`}>
						<OptimizedImage
							src={image || 'https://placehold.co/128x128/f3f4f6/9ca3af?text=%F0%9F%9A%97'}
							alt={product.title}
							fill
							className='object-cover'
							fallbackSrc='https://placehold.co/128x128/f3f4f6/9ca3af?text=%F0%9F%9A%97'
							logContext={{ orderId: order.id, page: 'orders' }}
						/>
					</div>
					<div className='min-w-0 flex-1'>
						<Link
							href={`/listings/${product.id}`}
							className='font-medium text-heading transition-colors hover:text-primary-500'>
							{product.title || (locale === 'en' ? 'Product' : 'Ürün')}
						</Link>
						<p className='text-sm text-muted'>
							1 {locale === 'en' ? 'x' : 'adet ×'} {formatTL(orderAmount(order))}
						</p>
					</div>
				</div>
			) : (
				<p className='text-muted'>
					{locale === 'en' ? 'Product info could not be loaded' : 'Ürün bilgisi yüklenemedi'}
				</p>
			)}

			<div
				className={`flex items-center justify-between border-t border-border-subtle ${
					compact ? 'mt-3 pt-3' : 'mt-4 pt-4'
				}`}>
				<div className='text-sm text-muted'>
					{order.isSeller
						? `${locale === 'en' ? 'Buyer' : 'Alıcı'}: ${order.buyer?.displayName || '-'}`
						: `${t('product.seller')}: ${order.seller?.displayName || t('product.seller')}`}
				</div>
				<div className='text-right'>
					<p className='text-lg font-semibold text-primary-500'>
						{formatTL(orderAmount(order))}
					</p>
					{order.isSeller && net != null && (
						<p className='mt-0.5 text-sm text-success-600'>
							{locale === 'en' ? 'Net to you' : 'Net kazanç'}: {formatTL(net)}
						</p>
					)}
				</div>
			</div>

			{hasVisibleShipment(order) && (
				<div className='mt-4 rounded-lg bg-surface p-3 text-sm'>
					<p>
						<span className='text-muted'>{t('order.shippingCompany')}:</span>{' '}
						{order.shipment!.carrier || order.shipment!.provider}
					</p>
					<p>
						<span className='text-muted'>{t('order.trackingNumber')}:</span>{' '}
						<span className='font-mono'>{order.shipment!.trackingNumber}</span>
					</p>
				</div>
			)}

			<OrderActions order={order} {...actions} />
		</div>
	);
}
