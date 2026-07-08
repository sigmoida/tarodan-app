/** @format */

'use client';

import { TruckIcon } from '@heroicons/react/24/outline';
import { Spinner, Stepper } from '@tarodan/ui';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Container } from '@/components/layout/Container';
import { CheckoutProvider, useCheckout } from './_context/CheckoutContext';
import AddressStep from './_sections/AddressStep';
import PaymentStep from './_sections/PaymentStep';
import ConfirmStep from './_sections/ConfirmStep';
import OrderSummarySidebar from './_sections/OrderSummarySidebar';
import GuestOtpModal from './_modals/GuestOtpModal';

function CheckoutLayout() {
	const {
		t,
		isMounted,
		step,
		goToStep,
		checkoutItems,
		directProductId,
		existingOrderId,
	} = useCheckout();

	// Wait for client mount before rendering dynamic content
	if (!isMounted) {
		return (
			<PageShell className='flex items-center justify-center'>
				<div className='text-center'>
					<Spinner size='xl' className='mx-auto mb-4' />
					<p className='text-muted'>Yükleniyor...</p>
				</div>
			</PageShell>
		);
	}

	// orderId ile geldiyse boş sepete atma; normal checkout'ta sepet boşsa ilanlara yönlendir
	if (checkoutItems.length === 0 && !directProductId && !existingOrderId) {
		return (
			<PageShell className='flex items-center justify-center'>
				<div className='text-center'>
					<TruckIcon className='w-20 h-20 text-border-strong mx-auto mb-4' />
					<h2 className='text-2xl font-bold text-heading mb-2'>
						{t('cart.empty')}
					</h2>
					<p className='text-muted mb-6'>{t('cart.emptyDesc')}</p>
					<ButtonLink href='/listings'>{t('cart.browseListings')}</ButtonLink>
				</div>
			</PageShell>
		);
	}

	return (
		<>
			<PageShell>
				<PageHeader title={t('checkout.title')} />

				<Container className='px-4 py-8'>
					{/* Clickable progress stepper — also handles going back to a step */}
					<Stepper
						steps={[t('checkout.step1'), t('checkout.step2'), t('checkout.step3')]}
						current={step}
						onStepClick={goToStep}
						className='mb-8'
					/>

					<div className='grid lg:grid-cols-3 gap-8'>
						{/* Main Content */}
						<div className='lg:col-span-2 space-y-6'>
							{step === 0 && <AddressStep />}
							{step === 1 && <PaymentStep />}
							{step === 2 && <ConfirmStep />}
						</div>

						{/* Order Summary Sidebar */}
						<div className='lg:col-span-1'>
							<OrderSummarySidebar />
						</div>
					</div>
				</Container>
			</PageShell>

			<GuestOtpModal />
		</>
	);
}

export default function CheckoutClient() {
	return (
		<CheckoutProvider>
			<CheckoutLayout />
		</CheckoutProvider>
	);
}
