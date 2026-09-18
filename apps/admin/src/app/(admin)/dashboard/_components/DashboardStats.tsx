"use client";

import { useTranslations } from "next-intl";
import { MetricCard } from "@/components/MetricCard";
import { fmtNumber, fmtTry } from "@/lib/format";
import { STAT_CARDS, type StatCardConfig } from "../_lib/statCards";
import type { DashboardMetrics } from "../_lib/metrics";

const FORMATTERS = {
  count: (n: number) => fmtNumber(n) ?? "—",
  currency: (n: number) => fmtTry(n) ?? "—",
} as const;

function StatCard({
  config,
  metrics,
  loading,
}: {
  config: StatCardConfig;
  metrics: DashboardMetrics;
  loading: boolean;
}) {
  const t = useTranslations();
  const format = FORMATTERS[config.format];
  const metric = metrics[config.metric];

  return (
    <MetricCard
      icon={config.icon}
      tone={config.tone}
      label={t(config.labelKey)}
      loading={loading}
      value={<span className="tabular-nums">{format(metric.period)}</span>}
      change={config.hideChange ? undefined : metric.changePercent}
      changeLabel={t("admin.dashboard.period.vsPrevious")}
      footer={
        <div className="mt-2 flex w-full min-w-0 flex-col">
          {/* The all-time figure never moves with the filter — that contrast
              is the point of the card. */}
          <span className="truncate text-xs text-muted">
            {t("admin.dashboard.period.allTime")}
          </span>
          <span className="truncate text-sm font-semibold tabular-nums text-heading">
            {format(metric.allTime)}
          </span>
          {config.noteKey && (
            <span className="mt-1 text-[11px] leading-tight text-subtle">
              {t(config.noteKey)}
            </span>
          )}
        </div>
      }
    />
  );
}

/**
 * Zone C — the ONLY zone the period filter touches. The headline number is the
 * selected period; the all-time figure underneath is not.
 */
export function DashboardStats({
  metrics,
  isLoading,
}: {
  metrics: DashboardMetrics;
  isLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {STAT_CARDS.map((config) => (
        <StatCard
          key={config.metric}
          config={config}
          metrics={metrics}
          loading={isLoading}
        />
      ))}
    </div>
  );
}
