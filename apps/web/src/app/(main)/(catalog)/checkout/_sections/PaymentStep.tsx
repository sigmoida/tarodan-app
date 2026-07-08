/** @format */

'use client';

import {
	CreditCardIcon,
	TruckIcon,
	ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';
import { useCheckout } from '../_context/CheckoutContext';

export default function PaymentStep() {
	const { locale, shippingLoading, nextStep } = useCheckout();

	return (
		<SectionCard
			title={locale === 'en' ? 'Payment Method' : 'Ödeme Yöntemi'}
			className='p-6'>
			{/* Carrier — Sürat Kargo sabit */}
			<div className='mb-6'>
				<h3 className='font-medium text-heading mb-3 flex items-center gap-2'>
					<TruckIcon className='w-5 h-5 text-primary-500' />
					Kargo Firması
				</h3>
				<div className='block p-4 border-2 border-primary-500 bg-primary-50 rounded'>
					<div className='flex items-center gap-2'>
						<TruckIcon className='w-5 h-5 text-primary-500' />
						<span className='font-medium'>Sürat Kargo</span>
					</div>
				</div>
				{shippingLoading && (
					<p className='text-sm text-muted mt-2'>Kargo ücreti hesaplanıyor...</p>
				)}
			</div>

			<h3 className='font-medium text-heading mb-3 flex items-center gap-2'>
				<CreditCardIcon className='w-5 h-5 text-primary-500' />
				{locale === 'en' ? 'Payment Method' : 'Ödeme Yöntemi'}
			</h3>
			<div className='block p-4 border-2 border-primary-500 bg-primary-50 rounded'>
				<div className='flex items-center gap-3'>
					<div className='flex-1'>
						<p className='font-semibold'>
							{locale === 'en' ? 'Pay with PayTR' : 'PayTR ile Öde'}
						</p>
						<p className='text-muted text-sm'>
							{locale === 'en'
								? 'Secure payment with credit card'
								: 'Kredi kartı ile güvenli ödeme'}
						</p>
					</div>
					<div className='text-2xl'>🏦</div>
				</div>
			</div>

			{/* PayTR güvenli ödeme bilgilendirmesi */}
			<div className='mt-6 p-4 bg-surface rounded border border-border'>
				<p className='text-sm text-body'>
					{locale === 'en'
						? "Click 'Continue' to proceed. Your card details will be entered securely on the PayTR payment page."
						: '“Devam Et” butonuna bastığınızda, kart bilgilerinizi güvenli PayTR ödeme sayfasında gireceksiniz.'}
				</p>
				<div className='mt-3 flex items-center gap-2 text-xs text-muted'>
					<ShieldCheckIcon className='w-4 h-4 text-success-500' />
					256-bit SSL ile şifrelenmiş güvenli ödeme
				</div>
			</div>

			{/* Invoice Info */}
			<div className='mt-6 p-4 bg-surface rounded'>
				<h3 className='font-medium text-heading mb-2'>Fatura Bilgisi</h3>
				<p className='text-sm text-muted'>
					Ödeme tamamlandıktan sonra faturanız e-posta adresinize otomatik olarak
					gönderilecektir. Kurumsal fatura için profil sayfanızdan vergi
					bilgilerinizi güncelleyebilirsiniz.
				</p>
			</div>

			<div className='mt-6 flex justify-end'>
				<Button onClick={nextStep}>Devam Et</Button>
			</div>
		</SectionCard>
	);
}
