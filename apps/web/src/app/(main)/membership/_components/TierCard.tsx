/** @format */

'use client';

import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { Badge, Button } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import { formatTL } from '@/lib/format';
import { displayPrice } from '../_lib/tiers';
import type { Period, Tier, TierPrices } from '../_lib/types';

export default function TierCard({
	tier,
	period,
	prices,
	isSelected,
	isCurrent,
	isExactCurrent,
	disabled,
	onSelect,
}: {
	tier: Tier;
	period: Period;
	prices: TierPrices;
	isSelected: boolean;
	isCurrent: boolean;
	isExactCurrent: boolean;
	disabled: boolean;
	onSelect: () => void;
}) {
	const { t } = useTranslation();
	const price = displayPrice(tier, period, prices);
	const discount = prices.yearly_discount_percentage ?? 20;

	const ctaLabel = isExactCurrent
		? t('membership.currentPlan')
		: tier.price === 0
			? t('membership.free')
			: t('common.continue');

	return (
		<div
			id={`tier-${tier.id}`}
			onClick={disabled ? undefined : onSelect}
			className={`relative flex flex-col rounded-xl border bg-surface-elevated p-8 transition-all ${
				disabled
					? 'cursor-not-allowed opacity-60'
					: 'cursor-pointer hover:border-primary-300'
			} ${
				isSelected
					? 'border-primary-500 ring-2 ring-primary-500'
					: tier.popular
						? 'border-primary-300'
						: 'border-border'
			}`}>
			{/* Corner badge */}
			<div className='absolute right-4 top-4'>
				{isSelected ? (
					<Badge variant='success' size='sm' icon={<CheckIcon className='h-3.5 w-3.5' />}>
						{t('common.selected')}
					</Badge>
				) : isCurrent ? (
					<Badge variant='info' size='sm'>
						{t('membership.currentPlan')}
					</Badge>
				) : tier.popular ? (
					<Badge variant='primary' size='sm'>
						{t('membership.mostPopular')}
					</Badge>
				) : null}
			</div>

			<h3 className='text-2xl font-bold text-heading'>{tier.name}</h3>
			<p className='mt-1.5 text-sm text-muted'>{tier.description}</p>

			<div className='mt-6'>
				<div className='flex items-baseline gap-1'>
					<span className='text-4xl font-bold text-heading'>
						{tier.price === 0 ? 'Ücretsiz' : formatTL(price)}
					</span>
					{tier.price > 0 && (
						<span className='text-base text-muted'>/{period === 'yearly' ? 'yıl' : 'ay'}</span>
					)}
				</div>
				{period === 'yearly' && tier.price > 0 && (
					<p className='mt-1.5 text-sm text-muted'>
						Ayda {formatTL(Math.round(price / 12))}
						<span className='ml-1 text-success-600'>· %{discount} indirim</span>
					</p>
				)}
			</div>

			<ul className='mt-6 flex-1 space-y-3'>
				{tier.features.map((feature, i) => (
					<li key={i} className='flex items-start gap-2.5'>
						{feature.included ? (
							<CheckIcon className='mt-0.5 h-5 w-5 flex-shrink-0 text-success-500' />
						) : (
							<XMarkIcon className='mt-0.5 h-5 w-5 flex-shrink-0 text-subtle' />
						)}
						<span className={`text-[15px] ${feature.included ? 'text-body' : 'text-subtle'}`}>
							{feature.text}
						</span>
					</li>
				))}
			</ul>

			<Button
				variant={isExactCurrent ? 'secondary' : tier.price === 0 ? 'outline' : 'primary'}
				size='lg'
				disabled={disabled}
				onClick={
					disabled
						? undefined
						: (e) => {
								e.stopPropagation();
								onSelect();
							}
				}
				className='mt-8 w-full'>
				{ctaLabel}
			</Button>
		</div>
	);
}
