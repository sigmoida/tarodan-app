/** @format */

'use client';

import Link from 'next/link';
import { CheckCircleIcon, ClockIcon, TruckIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { Spinner } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { SectionCard, ButtonLink } from '@/components/ui';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { usePaymentSuccess } from '../_hooks/usePaymentSuccess';
import { getEstimatedDelivery } from '../_lib/delivery';
import PaymentDetailsCard from './PaymentDetailsCard';

function Loading() {
	return (
		<PageShell className='flex min-h-[60vh] items-center justify-center'>
			<Spinner size='xl' />
		</PageShell>
	);
}

export default function PaymentSuccessClient() {
	const {
		phase,
		isCompleted,
		payment,
		invoice,
		invoiceError,
		downloading,
		handleDownloadInvoice,
		isAuthenticated,
		orderIdFromUrl,
		locale,
	} = usePaymentSuccess();

	if (phase === 'auth-loading') return <AuthLoadingScreen />;
	if (phase === 'client-loading' || phase === 'loading') return <Loading />;

	const en = locale === 'en';
	const orderId = payment?.orderId || orderIdFromUrl;

	return (
		<PageShell className='flex items-center justify-center p-4'>
			<div className='w-full max-w-2xl'>
				<SectionCard className='p-8 text-center'>
					<div
						className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
							isCompleted ? 'bg-success-100' : 'bg-warning-100'
						}`}>
						{isCompleted ? (
							<CheckCircleIcon className='h-12 w-12 text-success-500' />
						) : (
							<ClockIcon className='h-12 w-12 text-warning-600' />
						)}
					</div>

					<h1 className='mb-2 text-3xl font-bold text-heading'>
						{isCompleted
							? en
								? 'Payment Completed Successfully!'
								: 'Ödeme Başarıyla Tamamlandı!'
							: en
								? 'Your Payment Is Being Confirmed'
								: 'Ödemeniz Doğrulanıyor'}
					</h1>
					<p className='mb-6 text-muted'>
						{isCompleted
							? en
								? 'Your payment has been received and your order is being prepared.'
								: 'Ödemeniz alındı ve siparişiniz hazırlanmaya başlandı.'
							: en
								? "We've received your payment request but it isn't confirmed yet. You can check your order status from your orders page."
								: 'Ödeme talebiniz alındı ancak henüz onaylanmadı. Durumu Siparişlerim sayfasından takip edebilirsiniz.'}
					</p>

					{payment && (
						<div className='mb-6'>
							<PaymentDetailsCard
								payment={payment}
								isCompleted={isCompleted}
								invoice={invoice}
								invoiceError={invoiceError}
								downloading={downloading}
								onDownload={handleDownloadInvoice}
								locale={locale}
							/>
						</div>
					)}

					{payment?.createdAt && (
						<div className='mb-6 rounded-lg border border-info-200 bg-info-50 p-4'>
							<div className='mb-1 flex items-center justify-center gap-2 font-semibold text-info-900'>
								<TruckIcon className='h-5 w-5 text-info-600' />
								{en ? 'Estimated Delivery' : 'Tahmini Teslimat'}
							</div>
							<p className='font-medium text-info-700'>
								{getEstimatedDelivery(payment.createdAt, locale)}
							</p>
							<p className='mt-2 text-xs text-info-600'>
								{en
									? '*Delivery time may vary depending on the seller and shipping company.'
									: '*Teslimat süresi satıcı ve kargo firmasına göre değişebilir.'}
							</p>
						</div>
					)}

					<div className='mb-6 rounded-lg border border-info-200 bg-info-50 p-4 text-left text-sm text-info-800'>
						<strong>{en ? 'Information:' : 'Bilgilendirme:'}</strong>{' '}
						{isAuthenticated ? (
							<>
								{en ? 'Order confirmation email has been sent. Track it from ' : 'Sipariş onay e-postası gönderildi. Takip için '}
								<Link href='/profile/orders' className='font-medium underline'>
									{en ? 'My Orders' : 'Siparişlerim'}
								</Link>
								.
							</>
						) : (
							<>
								{en ? 'Order confirmation email has been sent. Track it from ' : 'Sipariş onay e-postası gönderildi. Takip için '}
								<Link href='/track-order' className='font-medium underline'>
									{en ? 'Track order' : 'Sipariş takip'}
								</Link>
								.
							</>
						)}
					</div>

					<div className='flex flex-col justify-center gap-3 sm:flex-row'>
						{isAuthenticated ? (
							<ButtonLink
								href={orderId ? `/profile/orders/${orderId}` : '/profile/orders'}
								className='gap-2'>
								{en ? 'View my order' : 'Siparişimi Görüntüle'}
								<ArrowRightIcon className='h-5 w-5' />
							</ButtonLink>
						) : (
							<ButtonLink href='/track-order' className='gap-2'>
								{en ? 'Track my order' : 'Siparişimi takip et'}
								<ArrowRightIcon className='h-5 w-5' />
							</ButtonLink>
						)}
						<ButtonLink variant='secondary' href='/listings'>
							{en ? 'Continue Shopping' : 'Alışverişe Devam Et'}
						</ButtonLink>
					</div>
				</SectionCard>
			</div>
		</PageShell>
	);
}
