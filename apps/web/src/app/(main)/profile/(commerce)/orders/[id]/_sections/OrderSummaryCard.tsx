/** @format */

'use client';

import { CreditCardIcon } from '@heroicons/react/24/outline';
import { SectionCard } from '@/components/ui';
import { formatPriceNumber, formatTL } from '@/lib/format';
import { useLocale, useTranslations } from "next-intl";
import { isMembershipOrder, orderAmountOf, type OrderDetail } from '../_lib/types';

export default function OrderSummaryCard({ order }: { order: OrderDetail }) {
	const locale = useLocale();
	const orderAmount = orderAmountOf(order);
	const p = order.pricing;

	const subtotal =
		p?.subtotal ??
		orderAmount -
			(p?.shippingAmount ?? order.shippingCost ?? 0) -
			(p?.buyerFeeAmount ?? order.buyerFeeAmount ?? 0);
	const shippingAmount = p?.shippingAmount ?? order.shippingCost ?? 0;
	const buyerFee = p?.buyerFeeAmount ?? order.buyerFeeAmount ?? 0;
	const sellerFee = p?.sellerFeeAmount ?? order.sellerFeeAmount ?? 0;

	return (
		<SectionCard
			title={
				<span className='flex items-center gap-2'>
					<CreditCardIcon className='w-5 h-5' />
					{locale === 'en' ? 'Order Summary' : 'Sipariş Özeti'}
				</span>
			}>
			<div className='space-y-3'>
				<div className='flex justify-between text-muted'>
					<span>{locale === 'en' ? 'Product Amount' : 'Ürün Tutarı'}</span>
					<span>₺{formatPriceNumber(subtotal)}</span>
				</div>
				{/* KDV: yalnızca kurumsal satıcıda (taxAmount > 0) ayrı satır */}
				{(p?.taxAmount ?? 0) > 0 && (
					<div className='flex justify-between text-muted'>
						<span>{locale === 'en' ? 'VAT' : 'KDV'}</span>
						<span>₺{formatPriceNumber(p?.taxAmount ?? 0)}</span>
					</div>
				)}
				{/* Üyelik/dijital siparişlerde kargo satırı yoktur */}
				{!isMembershipOrder(order) && (
					<div className='flex justify-between text-muted'>
						<span>{locale === 'en' ? 'Shipping' : 'Kargo'}</span>
						<span>
							{shippingAmount > 0
								? `₺${formatPriceNumber(shippingAmount)}`
								: locale === 'en'
									? 'Free'
									: 'Ücretsiz'}
						</span>
					</div>
				)}
				{buyerFee > 0 && (
					<div className='flex justify-between text-muted'>
						<span>{locale === 'en' ? 'Platform fee' : 'Platform ücreti'}</span>
						<span>₺{formatPriceNumber(buyerFee)}</span>
					</div>
				)}
				{order.isSeller && (sellerFee > 0 || p?.sellerNetAmount != null) && (
					<>
						<div className='flex justify-between text-muted'>
							<span>{locale === 'en' ? 'Platform deduction' : 'Platform kesintisi'}</span>
							<span>₺{formatPriceNumber(sellerFee)}</span>
						</div>
						{/* Stopaj: yalnızca kurumsal satıcıda (>0). GVK 94/19 — satıcı beyannamede mahsup eder. */}
						{(p?.withholdingTaxAmount ?? 0) > 0 && (
							<div className='flex justify-between text-muted'>
								<span>{locale === 'en' ? 'Withholding tax' : 'Stopaj (tevkifat)'}</span>
								<span>₺{formatPriceNumber(p?.withholdingTaxAmount ?? 0)}</span>
							</div>
						)}
						<div className='flex justify-between text-success-700 font-medium'>
							<span>{locale === 'en' ? 'Net to you' : 'Net kazanç'}</span>
							<span>
								₺
								{formatPriceNumber(
									p?.sellerNetAmount ?? (p?.subtotal ?? orderAmount) - sellerFee,
								)}
							</span>
						</div>
					</>
				)}
				<div className='border-t pt-3 flex justify-between font-semibold text-lg'>
					<span>{locale === 'en' ? 'Total' : 'Toplam'}</span>
					<span className='text-primary-500'>{formatTL(orderAmount)}</span>
				</div>
			</div>
		</SectionCard>
	);
}
