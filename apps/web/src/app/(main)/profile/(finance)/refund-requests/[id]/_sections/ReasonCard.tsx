/** @format */

'use client';

import OptimizedImage from '@/components/OptimizedImage';
import SectionCard from '@/components/ui/SectionCard';
import { reasonLabelOf } from '../../_lib/refund-status';
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
		<SectionCard title={locale === 'en' ? 'Reason' : 'Sebep'}>
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
								className='relative block h-20 w-20 overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-80'>
								<OptimizedImage
									src={url}
									alt={`${locale === 'en' ? 'Evidence' : 'Kanıt'} ${i + 1}`}
									fill
									sizes='80px'
									className='object-cover'
								/>
							</a>
						))}
					</div>
				</div>
			)}
		</SectionCard>
	);
}
