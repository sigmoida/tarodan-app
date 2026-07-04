/** @format */

'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button, Input, Textarea } from '@tarodan/ui';
import { useListingDetail } from '../_context/ListingDetailContext';

export default function OfferModal() {
	const {
		t,
		locale,
		listing,
		effectivePrice,
		showOfferModal,
		setShowOfferModal,
		offerAmount,
		setOfferAmount,
		offerMessage,
		setOfferMessage,
		isSubmittingOffer,
		handleSubmitOffer,
	} = useListingDetail();

	if (!showOfferModal || !listing) return null;

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-heading/50'>
			<div className='bg-surface-elevated rounded p-6 w-full max-w-md shadow-xl'>
				<div className='flex items-center justify-between mb-4'>
					<h2 className='text-xl font-semibold text-heading'>
						{t('product.makeOffer')}
					</h2>
					<Button
						variant='secondary'
						onClick={() => setShowOfferModal(false)}
						className='text-subtle hover:text-muted'>
						<XMarkIcon className='w-6 h-6' />
					</Button>
				</div>

				<div className='space-y-4'>
					<div>
						<label className='block text-sm font-medium text-body mb-2'>
							{t('product.productPrice')}
						</label>
						<div className='text-lg font-semibold text-heading'>
							{effectivePrice.toLocaleString('tr-TR')} TL
						</div>
						<p className='text-xs text-muted mt-1'>
							{locale === 'en' ? 'Minimum offer:' : 'Minimum teklif:'}{' '}
							{Math.round(effectivePrice * 0.5).toLocaleString('tr-TR')} TL (%50)
						</p>
					</div>

					<div>
						<label className='block text-sm font-medium text-body mb-2'>
							{locale === 'en' ? 'Your Offer Amount (TL)' : 'Teklif Tutarınız (TL)'}
						</label>
						<Input
							type='number'
							value={offerAmount}
							onChange={(e) => setOfferAmount(e.target.value)}
							placeholder={
								locale === 'en' ? 'Enter offer amount' : 'Teklif tutarını giriniz'
							}
							min={Math.round(effectivePrice * 0.5)}
							max={Math.max(0, Math.round(effectivePrice) - 1)}
							className='px-4 rounded'
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-body mb-2'>
							{locale === 'en' ? 'Message (Optional)' : 'Mesaj (Opsiyonel)'}
						</label>
						<Textarea
							value={offerMessage}
							onChange={(e) => setOfferMessage(e.target.value)}
							placeholder={
								locale === 'en'
									? 'Message you want to send to seller...'
									: 'Satıcıya iletmek istediğiniz mesaj...'
							}
							rows={4}
							maxLength={500}
							className='px-4 rounded resize-none'
						/>
						<p className='text-xs text-muted mt-1'>
							{offerMessage.length}/500{' '}
							{locale === 'en' ? 'characters' : 'karakter'}
						</p>
					</div>

					<div className='flex gap-3 pt-2'>
						<Button
							variant='secondary'
							onClick={() => setShowOfferModal(false)}
							className='flex-1 px-4 rounded text-body hover:bg-surface'>
							{t('common.cancel')}
						</Button>
						<Button
							variant='secondary'
							onClick={handleSubmitOffer}
							disabled={isSubmittingOffer || !offerAmount}
							className='flex-1 px-4 py-2 bg-primary-500 text-inverted rounded hover:bg-primary-600 disabled:bg-border-strong disabled:cursor-not-allowed'>
							{isSubmittingOffer ? t('common.sending') : t('product.sendOffer')}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
