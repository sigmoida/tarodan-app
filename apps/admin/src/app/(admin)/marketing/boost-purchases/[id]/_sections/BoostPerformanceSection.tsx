"use client";

import { useTranslations } from "next-intl";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { MetricCard } from "@/components/MetricCard";
import { fmtNumber } from "@/lib/format";
import type { BoostMetricValues, BoostPurchase } from "../../_lib/types";

/** Views, favourites and clicks before the boost, now, and the gain. */
export function BoostPerformanceSection({
  metrics,
}: {
  metrics: BoostPurchase["metrics"];
}) {
  const t = useTranslations();
  const labels = {
    views: t("admin.marketing.boostPurchases.views"),
    likes: t("admin.marketing.boostPurchases.favorites"),
    clicks: t("admin.marketing.boostPurchases.clicks"),
  };
  const pending = t("admin.marketing.boostPurchases.metricsPending");

  return (
    <section>
      <div className="mb-3">
        <SectionTitle as="h2">
          {t("admin.marketing.boostPurchases.performanceTitle")}
        </SectionTitle>
        <p className="mt-1 text-sm text-muted">
          {t("admin.marketing.boostPurchases.performanceHelper")}
        </p>
      </div>
      <div className="space-y-4">
        <MetricGroup
          title={t("admin.marketing.boostPurchases.before")}
          values={metrics.before}
          empty={pending}
          labels={labels}
        />
        <MetricGroup
          title={t("admin.marketing.boostPurchases.current")}
          values={metrics.current}
          labels={labels}
        />
        <MetricGroup
          title={t("admin.marketing.boostPurchases.gain")}
          values={metrics.gain}
          gain
          empty={pending}
          labels={labels}
        />
      </div>
    </section>
  );
}

/** One before/current/gain row: a titled group of the three boost metrics. */
function MetricGroup({
  title,
  values,
  gain = false,
  empty = "—",
  labels,
}: {
  title: string;
  values: BoostMetricValues | null;
  gain?: boolean;
  empty?: string;
  labels: Record<keyof BoostMetricValues, string>;
}) {
  const metricValue = (value: number) => (
    <span className={gain && value > 0 ? "text-success" : undefined}>
      {gain && value > 0 ? "+" : ""}
      {fmtNumber(value)}
    </span>
  );
  return (
    <div className="space-y-2">
      <SectionTitle as="h3" size="sm">
        {title}
      </SectionTitle>
      {values ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label={labels.views} value={metricValue(values.views)} />
          <MetricCard label={labels.likes} value={metricValue(values.likes)} />
          <MetricCard
            label={labels.clicks}
            value={metricValue(values.clicks)}
          />
        </div>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}
