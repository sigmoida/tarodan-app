/** @format */

'use client';

import { CurrencyDollarIcon } from '@heroicons/react/24/outline';
import { Badge } from '@tarodan/ui';
import { formatTL } from '@/lib/format';
import { statusMetaOf } from '../../_lib/refundStatus';
import type { RefundRequest } from '../../_lib/types';

export default function RefundHero({
	refund,
	locale,
}: {
	refund: RefundRequest;
	locale: string;
}) {
	const meta = statusMetaOf(refund.status);

	return (
		<div className='rounded-lg border border-border bg-surface-elevated p-6'>
			<div className='mb-3 flex items-start justify-between gap-3'>
				<div className='min-w-0'>
					<p className='mb-1 text-xs font-semibold uppercase tracking-wide text-muted'>
						{locale === 'en' ? 'Refund Request' : 'İade Talebi'}
					</p>
					<h1 className='font-mono text-2xl font-bold text-heading'>{refund.refundNumber}</h1>
					<p className='mt-1 text-sm text-muted'>
						{new Date(refund.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'tr-TR')}
					</p>
				</div>
				<Badge variant={meta.variant} className='flex-shrink-0'>
					{locale === 'en' ? meta.en : meta.tr}
				</Badge>
			</div>

			<div className='flex items-center gap-2 border-t border-border pt-3'>
				<CurrencyDollarIcon className='h-5 w-5 text-success-600' />
				<span className='text-sm text-muted'>
					{locale === 'en' ? 'Refund amount' : 'İade tutarı'}:
				</span>
				<span className='text-lg font-bold text-success-700'>
					{formatTL(Number(refund.amount))}
				</span>
			</div>
		</div>
	);
}
