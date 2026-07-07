/** @format */

'use client';

import toast from 'react-hot-toast';
import { TruckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import type { RefundRequest } from '../../_lib/types';

const TRANSIT_COPY: Record<string, { buyer: { tr: string; en: string }; seller: { tr: string; en: string } }> = {
	return_shipment_open: {
		buyer: {
			tr: 'Paketi en yakın Sürat şubesine bırakın. Kargo ücreti ödenmiştir — şubedeki personele bu numarayı verin:',
			en: 'Take the package to any Sürat branch. The shipment is paid — give them this tracking number:',
		},
		seller: {
			tr: 'Alıcıya iade etiketi verildi, paketi kargoya verecek. Takip numarası:',
			en: 'The buyer has been given a return label and will drop off the package. Tracking number:',
		},
	},
	return_in_transit: {
		buyer: {
			tr: 'Paketiniz satıcıya ulaşmak üzere yolda. Teslim edildiği anda paranız otomatik iade edilecek.',
			en: 'Your package is on its way back to the seller. Once delivered, your refund will be processed automatically.',
		},
		seller: {
			tr: 'İade paketi size doğru yolda. Teslim alındığında para iadesi otomatik işlenecek.',
			en: 'The return package is on its way to you. The refund will be processed once it is delivered.',
		},
	},
	return_delivered: {
		buyer: {
			tr: 'Paket satıcıya ulaştı. Para iadeniz şu anda işleniyor, kartınıza kısa süre içinde geçecek.',
			en: 'The package has reached the seller. Your refund is being processed and will be on your card shortly.',
		},
		seller: {
			tr: 'İade paketi size ulaştı. Para iadesi kısa süre içinde işlenecek.',
			en: 'The return package has arrived. The refund will be processed shortly.',
		},
	},
};

/** Return-shipment card — the most important card during the return phase. */
export default function ReturnShipmentCard({
	refund,
	isBuyer,
	locale,
}: {
	refund: RefundRequest;
	isBuyer: boolean;
	locale: string;
}) {
	const copy = TRANSIT_COPY[refund.status];
	const side = isBuyer ? 'buyer' : 'seller';

	return (
		<div className='rounded-lg border-2 border-info-200 bg-info-50 p-5'>
			<h2 className='mb-3 flex items-center gap-2 text-base font-semibold text-info-900'>
				<TruckIcon className='h-5 w-5' />
				{isBuyer
					? locale === 'en'
						? 'Your Return Shipment'
						: 'İade Kargonuz'
					: locale === 'en'
						? 'Incoming Return Shipment'
						: 'Alıcının İade Kargosu'}
			</h2>

			{copy && (
				<p className='mb-3 text-sm text-info-900'>
					{locale === 'en' ? copy[side].en : copy[side].tr}
				</p>
			)}

			{refund.returnTrackingNumber ? (
				<>
					<div className='mb-3 flex items-center justify-between gap-3 rounded-lg bg-surface-elevated p-4'>
						<span className='break-all font-mono text-lg font-bold text-heading'>
							{refund.returnTrackingNumber}
						</span>
						<Button
							variant='ghost'
							size='sm'
							onClick={() => {
								navigator.clipboard.writeText(refund.returnTrackingNumber!);
								toast.success(locale === 'en' ? 'Copied' : 'Kopyalandı');
							}}>
							<ClipboardDocumentIcon className='h-4 w-4' />
							{locale === 'en' ? 'Copy' : 'Kopyala'}
						</Button>
					</div>
					{refund.returnProvider === 'surat' && (
						<Button asChild variant='link' size='sm'>
							<a
								href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(
									refund.returnTrackingNumber,
								)}`}
								target='_blank'
								rel='noopener noreferrer'>
								<TruckIcon className='h-4 w-4' />
								{locale === 'en' ? 'Track on Sürat' : "Sürat'ta Takip Et"}
							</a>
						</Button>
					)}
				</>
			) : (
				<p className='text-sm text-info-700'>
					{locale === 'en'
						? 'Your return tracking number is being generated, please check back shortly.'
						: 'İade kargo numaranız oluşturuluyor, kısa süre içinde burada görünecek.'}
				</p>
			)}
		</div>
	);
}
