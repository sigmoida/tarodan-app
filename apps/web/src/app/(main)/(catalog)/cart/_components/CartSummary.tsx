/** @format */

'use client';

import Link from 'next/link';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { SectionCard } from '@/components/ui';
import { useTranslation } from '@/i18n';

interface AppliedDiscount {
	discountId: string;
	discountName: string;
	discountCode?: string | null;
	appliedAmount: number | string;
}

const fmtTL = (n: number) =>
	n.toLocaleString('tr-TR', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

export default function CartSummary({
	subtotal,
	appliedDiscounts,
	buyerFee,
	grandTotal,
	isAuthenticated,
}: {
	subtotal: number;
	appliedDiscounts?: AppliedDiscount[];
	buyerFee: number;
	grandTotal: number;
	isAuthenticated: boolean;
}) {
	const { t, locale } = useTranslation();

	// Automatic campaign discounts (those without a coupon code).
	const autoDiscounts = (appliedDiscounts ?? []).filter((d) => !d.discountCode);

	return (
		<SectionCard title={t('checkout.orderSummary')} className='p-6 sticky top-24'>
			<div className='space-y-3 text-sm'>
				<div className='flex justify-between'>
					<span className='text-muted'>{t('checkout.subtotal')}</span>
					<span className='font-medium'>{fmtTL(subtotal ?? 0)} TL</span>
				</div>

				{autoDiscounts.map((d) => (
					<div
						key={d.discountId}
						className='flex justify-between text-success-600'>
						<span>{d.discountName}</span>
						<span className='font-medium'>-{fmtTL(Number(d.appliedAmount))} TL</span>
					</div>
				))}

				{buyerFee > 0 && (
					<div className='flex justify-between'>
						<span className='text-muted'>
							{locale === 'en' ? 'Platform Service Fee' : 'Platform Hizmet Bedeli'}
						</span>
						<span className='font-medium'>{fmtTL(buyerFee)} TL</span>
					</div>
				)}

				<div className='flex justify-between'>
					<span className='text-muted'>{t('checkout.shipping')}</span>
					<span className='text-subtle'>
						{locale === 'en'
							? 'Calculated at checkout'
							: 'Ödeme adımında hesaplanır'}
					</span>
				</div>

				<hr className='my-1' />

				<div className='flex justify-between text-lg'>
					<span className='font-semibold'>{t('checkout.total')}</span>
					<span className='font-bold text-primary-500'>
						₺{(grandTotal ?? 0).toFixed(2)}
					</span>
				</div>
			</div>

			<ButtonLink href='/checkout' className='w-full mt-6 flex gap-2'>
				{t('cart.proceedToCheckout')}
			</ButtonLink>

			{!isAuthenticated && (
				<div className='mt-3 space-y-2'>
					<ButtonLink
						variant='secondary'
						href={`/login?redirect=${encodeURIComponent('/cart')}`}
						className='w-full flex gap-2'>
						<LockClosedIcon className='w-4 h-4' />
						{locale === 'en'
							? 'Login for faster checkout'
							: 'Hızlı ödeme için giriş yapın'}
					</ButtonLink>
					<p className='text-xs text-muted text-center'>
						{locale === 'en'
							? 'Your cart will be saved after login.'
							: 'Sepetiniz giriş yaptıktan sonra korunacak.'}
					</p>
				</div>
			)}

			<Link
				href='/listings'
				className='block text-center text-sm text-muted hover:text-primary-500 mt-4'>
				{t('cart.continueShopping')}
			</Link>
		</SectionCard>
	);
}
