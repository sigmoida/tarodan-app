/** @format */

'use client';

import Link from 'next/link';
import type { RefundRequest } from '../../_lib/types';

export default function RelatedOrderCard({
	refund,
	locale,
}: {
	refund: RefundRequest;
	locale: string;
}) {
	const image = refund.order?.product?.images?.[0];

	return (
		<div className='rounded-lg border border-border bg-surface-elevated p-5'>
			<h2 className='mb-3 text-sm font-semibold text-heading'>
				{locale === 'en' ? 'Related Order' : 'İlgili Sipariş'}
			</h2>
			<Link
				href={`/profile/orders/${refund.order.id}`}
				className='-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface'>
				<div className='flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface'>
					{image ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={image}
							alt={refund.order.product?.title ?? ''}
							className='h-full w-full object-cover'
						/>
					) : (
						<span className='text-2xl'>📦</span>
					)}
				</div>
				<div className='min-w-0 flex-1'>
					<p className='truncate font-medium text-heading'>
						{refund.order.product?.title ?? '—'}
					</p>
					<p className='text-sm text-muted'>{refund.order.orderNumber}</p>
				</div>
				<span className='whitespace-nowrap text-sm font-medium text-primary-600'>
					{locale === 'en' ? 'View →' : 'Aç →'}
				</span>
			</Link>
		</div>
	);
}
