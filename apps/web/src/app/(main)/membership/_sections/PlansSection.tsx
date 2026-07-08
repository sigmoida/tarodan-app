/** @format */

'use client';

import { Button } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import PeriodToggle from '../_components/PeriodToggle';
import TierCard from '../_components/TierCard';
import type { Period, Tier, TierPrices } from '../_lib/types';

const GRID_BY_COUNT: Record<number, string> = {
	1: 'grid-cols-1 max-w-md',
	2: 'grid-cols-1 md:grid-cols-2 max-w-3xl',
	3: 'grid-cols-1 md:grid-cols-3 max-w-5xl',
	4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 max-w-6xl',
};

interface Props {
	tiers: Tier[];
	prices: TierPrices;
	period: Period;
	onPeriodChange: (p: Period) => void;
	selectedTier: string | null;
	currentTier: string | null;
	isAuthenticated: boolean;
	isExactCurrentPlan: (tierId: string) => boolean;
	onSelect: (tierId: string) => void;
	onContinue: () => void;
}

export default function PlansSection({
	tiers,
	prices,
	period,
	onPeriodChange,
	selectedTier,
	currentTier,
	isAuthenticated,
	isExactCurrentPlan,
	onSelect,
	onContinue,
}: Props) {
	const { t } = useTranslation();
	const showContinue =
		!!selectedTier && selectedTier !== 'free' && !isExactCurrentPlan(selectedTier);

	return (
		<div className='space-y-8'>
			<PeriodToggle
				value={period}
				onChange={onPeriodChange}
				discountPct={prices.yearly_discount_percentage ?? 20}
			/>

			<div className='flex justify-center'>
				<div className={`grid gap-6 ${GRID_BY_COUNT[tiers.length] ?? GRID_BY_COUNT[4]}`}>
					{tiers.map((tier) => (
						<TierCard
							key={tier.id}
							tier={tier}
							period={period}
							prices={prices}
							isSelected={selectedTier === tier.id}
							isCurrent={currentTier === tier.id}
							isExactCurrent={isExactCurrentPlan(tier.id)}
							disabled={tier.price === 0 && currentTier === 'free' && isAuthenticated}
							onSelect={() => onSelect(tier.id)}
						/>
					))}
				</div>
			</div>

			{showContinue && (
				<div className='flex justify-center'>
					<Button variant='primary' size='lg' onClick={onContinue} className='px-12'>
						{t('common.continue')}
					</Button>
				</div>
			)}
		</div>
	);
}
