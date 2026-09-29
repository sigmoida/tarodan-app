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

/** One fixed footer figure — label above value, both truncated for tight columns. */
function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-[11px] text-muted">{label}</span>
      <span className="truncate text-xs font-semibold tabular-nums text-heading">
        {value}
      </span>
    </div>
  );
}

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
      footer={
        <div className="flex w-full min-w-0 flex-col gap-2">
          {/* Three FIXED figures — none of them move with the period filter,
              only the headline above does. That contrast is the point of the
              card, so there is no trend/% row here. */}
          <div className="grid w-full grid-cols-3 gap-2">
            <FooterStat
              label={t("admin.dashboard.period.yesterday")}
              value={format(metric.yesterday)}
            />
            <FooterStat
              label={t("admin.dashboard.period.thisMonth")}
              value={format(metric.thisMonth)}
            />
            <FooterStat
              label={t("admin.dashboard.period.allTime")}
              value={format(metric.allTime)}
            />
          </div>
          {config.noteKey && (
            <span className="text-[11px] leading-tight text-subtle">
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
 * selected period; the three footer figures (Dün / Bu ay / Tüm zamanlar)
 * underneath never move with the filter.
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
