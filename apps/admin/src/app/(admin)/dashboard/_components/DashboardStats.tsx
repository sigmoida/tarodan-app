"use client";

import { useTranslations } from "next-intl";
import { MetricCard } from "@/components/MetricCard";
import { fmtNumber, fmtTry } from "@/lib/format";
import { STAT_CARDS, type StatCardConfig } from "../_lib/statCards";
import type { DashboardMetrics } from "../_lib/types";

const FORMATTERS = {
  count: (n: number) => fmtNumber(n) ?? "—",
  currency: (n: number) => fmtTry(n) ?? "—",
} as const;

function PairValue({ left, right }: { left: string; right: string }) {
  return (
    <span className="tabular-nums">
      {left}
      <span className="mx-1 text-muted">/</span>
      {right}
    </span>
  );
}

/**
 * All-time figure under the period figure. It never changes with the filter —
 * that contrast is the point of the card.
 */
function AllTime({ value }: { value: React.ReactNode }) {
  const t = useTranslations();
  return (
    <div className="mt-2 flex w-full min-w-0 flex-col">
      <span className="truncate text-xs text-muted">
        {t("admin.dashboard.period.allTime")}
      </span>
      <span className="truncate text-sm font-semibold tabular-nums text-heading">
        {value}
      </span>
    </div>
  );
}

function StatCard({
  config,
  metrics,
}: {
  config: StatCardConfig;
  metrics: DashboardMetrics;
}) {
  const t = useTranslations();
  const format = FORMATTERS[config.format];
  const main = metrics[config.metric];
  const secondary = config.secondary
    ? metrics[config.secondary.metric]
    : undefined;

  // Two numbers separated by a slash mean nothing on their own — the pair is
  // named in the label, not hidden in a tooltip (the old "680 / 10" problem).
  const pairSuffix = config.secondary
    ? ` (${t(config.secondary.leftKey)} / ${t(config.secondary.rightKey)})`
    : "";

  return (
    <MetricCard
      icon={config.icon}
      tone={config.tone}
      label={`${t(config.labelKey)}${pairSuffix}`}
      value={
        secondary ? (
          <PairValue
            left={format(main.period)}
            right={format(secondary.period)}
          />
        ) : (
          <span className="tabular-nums">{format(main.period)}</span>
        )
      }
      change={main.changePercent}
      changeLabel={t("admin.dashboard.period.vsPrevious")}
      footer={
        <AllTime
          value={
            secondary ? (
              <PairValue
                left={format(main.allTime)}
                right={format(secondary.allTime)}
              />
            ) : (
              format(main.allTime)
            )
          }
        />
      }
    />
  );
}

/**
 * The dashboard's eight stat cards. The headline number follows the period
 * filter; the all-time figure underneath does not.
 */
export function DashboardStats({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      {STAT_CARDS.map((config) => (
        <StatCard key={config.id} config={config} metrics={metrics} />
      ))}
    </div>
  );
}
