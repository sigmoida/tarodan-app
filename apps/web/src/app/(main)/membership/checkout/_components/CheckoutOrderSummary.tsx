/** @format */

'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import { SectionCard } from '@/components/ui';
import type { TierInfo } from '../_lib/tiers';

const fmt = (n: number) =>
	n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CheckoutOrderSummary({
	tierInfo,
	period,
}: {
	tierInfo: TierInfo;
	period: 'monthly' | 'yearly';
}) {
	const finalPrice = tierInfo.price;
	const basePrice = tierInfo.basePrice;
	const yearly = period === 'yearly';
	const monthlyPrice = yearly ? Math.round(finalPrice / 12) : finalPrice;
	const normalYear = basePrice * 12;
	const discountPct =
		normalYear > 0 ? Math.round((1 - finalPrice / normalYear) * 100) : 0;

	return (
		<SectionCard title='Sipariş Özeti' className='p-6 sticky top-8'>
			<div className='border-b border-border pb-4 mb-4'>
				<h3 className='font-semibold text-heading'>{tierInfo.name}</h3>
				<p className='text-sm text-muted'>{yearly ? 'Yıllık plan' : 'Aylık plan'}</p>
			</div>

			<ul className='space-y-2 mb-6'>
				{tierInfo.features.map((feature) => (
					<li key={feature} className='flex items-center gap-2 text-sm text-muted'>
						<CheckIcon className='w-4 h-4 text-success-500 flex-shrink-0' />
						{feature}
					</li>
				))}
			</ul>

			<div className='border-t border-border pt-4 space-y-2'>
				{yearly && (
					<>
						<div className='flex justify-between text-sm text-muted'>
							<span>Normal fiyat</span>
							<span className='line-through'>{fmt(normalYear)} TL</span>
						</div>
						<div className='flex justify-between text-sm text-success-600'>
							<span>İndirim (%{discountPct})</span>
							<span>-{fmt(normalYear - finalPrice)} TL</span>
						</div>
					</>
				)}
				<div className='flex justify-between text-lg font-semibold'>
					<span>Toplam</span>
					<span className='text-primary-500'>{fmt(finalPrice)} TL</span>
				</div>
				{yearly && (
					<p className='text-xs text-muted text-right'>Ayda {fmt(monthlyPrice)} TL</p>
				)}
			</div>
		</SectionCard>
	);
}
