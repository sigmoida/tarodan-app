"use client";

import { useTranslations } from "next-intl";
import { Alert, EmptyState } from "@tarodan/ui";
import type {
  AnalyticsBreakdownRow,
  AnalyticsBoostPackageRow,
  AnalyticsFunnelStep,
  AnalyticsLeaderRow,
  AnalyticsStampTruncation,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import { MetricCard } from "@/components/MetricCard";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtDate } from "@/lib/format";
import { formatMetric } from "../_lib/labels";
import type { TabSections } from "../_lib/tabConfig";
import type { AnalyticsTabData } from "../_lib/useAnalyticsTab";
import { BreakdownTable, BoostPackageTable } from "./BreakdownTable";
import { FunnelTable } from "./FunnelTable";
import { LeaderTable } from "./LeaderTable";
import { TrendChart } from "./TrendChart";

/** Rows the API omits are absent, not empty — read them defensively once. */
function rowsOf<T>(data: AnalyticsTabData | null, field: string): T[] {
  const value = data?.[field];
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * ONE renderer for every analytics tab, driven by {@link TabSections}.
 *
 * The four old tabs were near-identical JSX files, each with its own cards,
 * its own chart wiring and its own idea of "no data" — one of them keyed the
 * empty state off a row array the screen never rendered, so a tab with real
 * numbers could show "no data for this period".
 */
export function AnalyticsTabView({
  sections,
  data,
  isLoading,
}: {
  sections: TabSections;
  data: AnalyticsTabData | null;
  isLoading: boolean;
}) {
  const t = useTranslations();

  // "Nothing happened" is decided by the metrics the screen actually shows,
  // not by a list it does not render.
  const measured =
    data && sections.cards.some((card) => data.metrics[card.metric]?.current);

  if (!isLoading && data && !measured) {
    return <EmptyState title={t("admin.analytics.empty")} />;
  }

  // Every stamp whose history starts later than the window asked for. One
  // sentence, one shape, whichever tab and however many stamps it measures.
  const truncations = rowsOf<AnalyticsStampTruncation>(data, "truncations");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sections.cards.map((card) => {
          const metric = data?.metrics[card.metric];
          return (
            <MetricCard
              key={card.metric}
              icon={card.icon}
              tone={card.tone}
              label={t(card.labelKey)}
              loading={isLoading}
              value={
                <span className="tabular-nums">
                  {formatMetric(t, metric?.current ?? 0, card.format)}
                </span>
              }
              // A comparison that was not requested is ABSENT, never zero:
              // showing "0%" would read as "flat", a different claim.
              change={metric?.changePercent ?? undefined}
              changeLabel={t("admin.analytics.filters.vsPrevious")}
              // What the number cannot tell you, printed where it is read —
              // not in a tooltip nobody opens.
              footer={
                card.noteKey && (
                  <span className="mt-2 text-[11px] leading-tight text-subtle">
                    {t(card.noteKey)}
                  </span>
                )
              }
            />
          );
        })}
      </div>

      {truncations.map((truncation) => (
        <Alert key={truncation.stamp} variant="warning">
          {t("admin.analytics.notes.truncated", {
            stamp: t(`admin.analytics.stamp.${truncation.stamp}` as MessageKey),
            date: fmtDate(truncation.since) ?? truncation.since,
          })}
        </Alert>
      ))}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {sections.charts.map((chart) => (
          <SectionCard
            key={chart.keys.join("-")}
            title={t("admin.analytics.section.trend")}
          >
            <TrendChart
              config={chart}
              series={data?.series ?? []}
              loading={isLoading}
            />
          </SectionCard>
        ))}
      </div>

      {sections.funnels.map((funnel) => (
        <SectionCard key={funnel.field} title={t(funnel.titleKey)}>
          <FunnelTable
            steps={rowsOf<AnalyticsFunnelStep>(data, funnel.field)}
          />
        </SectionCard>
      ))}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {sections.breakdowns.map((breakdown) => (
          <SectionCard key={breakdown.field} title={t(breakdown.titleKey)}>
            <BreakdownTable
              config={breakdown}
              rows={rowsOf<AnalyticsBreakdownRow>(data, breakdown.field)}
            />
          </SectionCard>
        ))}
      </div>

      {sections.boostPackages && (
        <SectionCard title={t(sections.boostPackages.titleKey)}>
          <BoostPackageTable
            rows={rowsOf<AnalyticsBoostPackageRow>(
              data,
              sections.boostPackages.field,
            )}
          />
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {sections.leaders.map((leader) => (
          <SectionCard key={leader.field} title={t(leader.titleKey)}>
            <LeaderTable
              rows={rowsOf<AnalyticsLeaderRow>(data, leader.field)}
            />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
