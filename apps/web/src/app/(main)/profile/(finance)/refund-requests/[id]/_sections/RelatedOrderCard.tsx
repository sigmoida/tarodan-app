/** @format */

'use client';

import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import SectionCard from '@/components/ui/SectionCard';
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
		<SectionCard title={locale === 'en' ? 'Related Order' : 'İlgili Sipariş'}>
			<Link
				href={`/profile/orders/${refund.order.id}`}
				className='-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface'>
				<div className='relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface'>
					{image ? (
						<OptimizedImage
							src={image}
							alt={refund.order.product?.title ?? ''}
							fill
							sizes='56px'
							className='object-cover'
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
		</SectionCard>
	);
}
