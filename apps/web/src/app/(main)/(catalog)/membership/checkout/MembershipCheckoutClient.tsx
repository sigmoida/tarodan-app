/** @format */

'use client';

import Link from 'next/link';
import {
	CreditCardIcon,
	ShieldCheckIcon,
	ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { Button, Checkbox, Spinner } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Container } from '@/components/layout/Container';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { useMembershipCheckout } from './_hooks/useMembershipCheckout';
import CheckoutOrderSummary from './_components/CheckoutOrderSummary';

function CenteredShell({ children }: { children: React.ReactNode }) {
	return (
		<PageShell className='flex items-center justify-center'>{children}</PageShell>
	);
}

export default function MembershipCheckoutClient() {
	const {
		period,
		required,
		isPaidTier,
		isAuthenticated,
		authLoading,
		tiersLoading,
		tierInfo,
		agreed,
		setAgreed,
		isProcessing,
		handleSubmit,
	} = useMembershipCheckout();

	const backHref = required
		? '/profile/membership?required=true'
		: '/profile/membership';

	if (authLoading) return <AuthLoadingScreen />;
	if (!isAuthenticated) {
		return (
			<CenteredShell>
				<Spinner size='xl' />
			</CenteredShell>
		);
	}
	if (tiersLoading && isPaidTier) {
		return (
			<CenteredShell>
				<Spinner size='xl' />
			</CenteredShell>
		);
	}
	if (!tierInfo) {
		return (
			<CenteredShell>
				<div className='text-center'>
					<p className='text-muted mb-4'>Geçersiz üyelik planı</p>
					<Link href={backHref} className='text-primary-500 hover:underline'>
						Planlara Dön
					</Link>
				</div>
			</CenteredShell>
		);
	}

	const priceLabel = tierInfo.price.toLocaleString('tr-TR', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

	return (
		<PageShell>
			<PageHeader
				title='Üyelik Yükseltme'
				description='Güvenli ödeme ile üyeliğinizi yükseltin'
			/>

			<Container className='px-4 py-8'>
				<Link
					href={backHref}
					className='inline-flex items-center gap-2 text-sm text-muted hover:text-primary-600 transition-colors mb-6'>
					<ArrowLeftIcon className='w-4 h-4' />
					Planlara Dön
				</Link>

				<div className='grid lg:grid-cols-3 gap-6'>
					{/* Payment */}
					<form onSubmit={handleSubmit} className='lg:col-span-2 space-y-4'>
						<SectionCard title='Güvenli Ödeme' className='p-6'>
							<div className='flex items-center gap-2 text-sm text-muted mb-4'>
								<CreditCardIcon className='w-5 h-5 text-primary-500 flex-shrink-0' />
								<p>
									Onayladıktan sonra güvenli ödeme sayfamızda kart bilgilerinizi
									girip 3D Secure ile ödersiniz. Kart bilgileriniz saklanmaz; PayTR
									altyapısıyla işlenir.
								</p>
							</div>

							<label className='flex items-start gap-3 cursor-pointer'>
								<Checkbox
									checked={agreed}
									onChange={(e) => setAgreed(e.target.checked)}
									className='mt-0.5 h-5 w-5'
								/>
								<span className='text-sm text-muted'>
									<Link href='/terms' className='text-primary-500 hover:underline'>
										Kullanım koşullarını
									</Link>{' '}
									ve{' '}
									<Link href='/privacy' className='text-primary-500 hover:underline'>
										gizlilik politikasını
									</Link>{' '}
									okudum, kabul ediyorum. Üyeliğimin{' '}
									{period === 'yearly' ? 'yıllık' : 'aylık'} olarak otomatik
									yenileneceğini anlıyorum.
								</span>
							</label>
						</SectionCard>

						<Button
							variant='primary'
							size='lg'
							type='submit'
							disabled={isProcessing}
							className='w-full gap-2'>
							{isProcessing ? (
								<>
									<Spinner
										size='sm'
										color='border-surface-elevated border-t-transparent'
									/>
									İşleniyor...
								</>
							) : (
								<>
									<ShieldCheckIcon className='w-5 h-5' />
									{priceLabel} TL Öde
								</>
							)}
						</Button>

						<p className='text-center text-sm text-muted flex items-center justify-center gap-2'>
							<ShieldCheckIcon className='w-4 h-4' />
							256-bit SSL ile güvenli ödeme
						</p>
					</form>

					{/* Order summary */}
					<div className='lg:col-span-1'>
						<CheckoutOrderSummary tierInfo={tierInfo} period={period} />
					</div>
				</div>
			</Container>
		</PageShell>
	);
}
