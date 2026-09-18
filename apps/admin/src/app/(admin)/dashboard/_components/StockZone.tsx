"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import type { DashboardStockResponse } from "@tarodan/types";
import { MetricCard } from "@/components/MetricCard";
import { fmtNumber, fmtTry } from "@/lib/format";
import { STOCK_CARDS } from "../_lib/zoneConfig";

const FORMATTERS = {
  count: (value: number) => fmtNumber(value) ?? "—",
  currency: (value: number) => fmtTry(value) ?? "—",
} as const;

/**
 * Zone D — balances, not flows. Never date-filtered: "how much is in escrow"
 * has no period. Active memberships carry their tier breakdown, which no other
 * admin screen shows today.
 */
export function StockZone({
  stock,
  isLoading,
}: {
  stock: DashboardStockResponse | null | undefined;
  isLoading: boolean;
}) {
  const t = useTranslations();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-heading">
        {t("admin.dashboard.zones.stock")}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STOCK_CARDS.map((card) => (
          <MetricCard
            key={card.key}
            icon={card.icon}
            tone={card.tone}
            label={t(card.labelKey)}
            loading={isLoading}
            value={
              <span className="tabular-nums">
                {FORMATTERS[card.format](stock?.values?.[card.key] ?? 0)}
              </span>
            }
            footer={
              card.key === "activeMemberships" &&
              stock?.membershipsByTier?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {stock.membershipsByTier.map((tier) => (
                    <Badge key={tier.tierType} variant="secondary" size="sm">
                      {tier.tierName} · {fmtNumber(tier.count)}
                    </Badge>
                  ))}
                </div>
              ) : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
