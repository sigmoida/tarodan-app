/** @format */

'use client';

import { reasonLabelOf } from '../../_lib/refundStatus';
import type { RefundRequest } from '../../_lib/types';

export default function ReasonCard({
	refund,
	locale,
}: {
	refund: RefundRequest;
	locale: string;
}) {
	const reason = reasonLabelOf(refund.reason);
	const photos = Array.isArray(refund.evidencePhotoUrls) ? refund.evidencePhotoUrls : [];

	return (
		<div className='rounded-lg border border-border bg-surface-elevated p-5'>
			<h2 className='mb-3 text-sm font-semibold text-heading'>
				{locale === 'en' ? 'Reason' : 'Sebep'}
			</h2>
			<p className='text-base font-medium text-heading'>
				{locale === 'en' ? reason.en : reason.tr}
			</p>

			{refund.description && (
				<div className='mt-3 border-t border-border pt-3'>
					<p className='mb-1 text-xs font-semibold uppercase tracking-wide text-muted'>
						{locale === 'en' ? 'Description' : 'Açıklama'}
					</p>
					<p className='whitespace-pre-wrap text-sm text-body'>{refund.description}</p>
				</div>
			)}

			{photos.length > 0 && (
				<div className='mt-3 border-t border-border pt-3'>
					<p className='mb-2 text-xs font-semibold uppercase tracking-wide text-muted'>
						{locale === 'en' ? 'Evidence' : 'Kanıt'}
					</p>
					<div className='flex flex-wrap gap-2'>
						{photos.map((url, i) => (
							<a
								key={i}
								href={url}
								target='_blank'
								rel='noopener noreferrer'
								className='block h-20 w-20 overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-80'>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={url}
									alt={`${locale === 'en' ? 'Evidence' : 'Kanıt'} ${i + 1}`}
									className='h-full w-full object-cover'
								/>
							</a>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
