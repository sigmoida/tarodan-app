/** @format */

"use client";

import PeriodToggle from "../_components/PeriodToggle";
import TierCard from "../_components/TierCard";
import type { Period, Tier, TierPrices } from "../_lib/types";

const GRID_BY_COUNT: Record<number, string> = {
  1: "grid-cols-1 max-w-lg",
  2: "grid-cols-1 md:grid-cols-2 max-w-4xl",
  3: "grid-cols-1 md:grid-cols-3 max-w-6xl",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 max-w-7xl",
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
}: Props) {
  return (
    <div className="space-y-8">
      <PeriodToggle
        value={period}
        onChange={onPeriodChange}
        discountPct={prices.yearly_discount_percentage ?? 20}
      />

      <div className="flex justify-center">
        <div
          className={`grid w-full gap-8 ${GRID_BY_COUNT[tiers.length] ?? GRID_BY_COUNT[4]}`}
        >
          {tiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              period={period}
              prices={prices}
              isSelected={selectedTier === tier.id}
              isCurrent={currentTier === tier.id}
              isExactCurrent={isExactCurrentPlan(tier.id)}
              disabled={
                tier.price === 0 && currentTier === "free" && isAuthenticated
              }
              onSelect={() => onSelect(tier.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
