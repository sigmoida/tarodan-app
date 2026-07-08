/** @format */

'use client';

import Link from 'next/link';
import { Badge } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import { formatTL } from '@/lib/format';
import { statusMetaOf } from '../_lib/refund-status';
import type { RefundRequest } from '../_lib/types';

export default function RefundRequestCard({ request }: { request: RefundRequest }) {
	const { locale } = useTranslation();
	const meta = statusMetaOf(request.status);
	const image = request.order?.product?.images?.[0];

	return (
		<Link
			href={`/profile/refund-requests/${request.id}`}
			className='block rounded-lg border border-border bg-surface-elevated p-4 transition-shadow hover:shadow-md'>
			<div className='flex items-start gap-3'>
				<div className='flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface'>
					{image ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={image}
							alt={request.order?.product?.title ?? ''}
							className='h-full w-full object-cover'
						/>
					) : (
						<span className='text-2xl'>📦</span>
					)}
				</div>
				<div className='min-w-0 flex-1'>
					<p className='text-sm text-muted'>
						{locale === 'en' ? 'Refund' : 'İade'} #{request.refundNumber}
					</p>
					<p className='mt-1 truncate font-medium text-heading'>
						{request.order?.product?.title ?? '—'}
					</p>
					<p className='mt-1 text-sm text-muted'>
						{locale === 'en' ? 'Order' : 'Sipariş'} {request.order?.orderNumber} ·{' '}
						{formatTL(Number(request.amount))}
					</p>
				</div>
				<Badge variant={meta.variant} size='sm' className='flex-shrink-0'>
					{locale === 'en' ? meta.en : meta.tr}
				</Badge>
			</div>
		</Link>
	);
}
