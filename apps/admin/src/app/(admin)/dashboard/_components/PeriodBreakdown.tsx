"use client";

import { useTranslations } from "next-intl";
import type { MetricPeriods } from "../_lib/types";

/**
 * Yesterday / this-month / last-month footer for a dashboard `MetricCard`.
 * Pass a `format` fn (₺, count, …) so numeric formatting matches the parent card.
 */
export function PeriodBreakdown({
  periods,
  format = (n: number) => n.toLocaleString(),
}: {
  periods: MetricPeriods;
  format?: (n: number) => string;
}) {
  const t = useTranslations();
  const rows: Array<{ label: string; value: number }> = [
    { label: t("admin.dashboard.period.yesterday"), value: periods.yesterday },
    { label: t("admin.dashboard.period.thisMonth"), value: periods.thisMonth },
    { label: t("admin.dashboard.period.lastMonth"), value: periods.lastMonth },
  ];
  return (
    <div className="mt-2 grid w-full grid-cols-3 gap-2 text-xs">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col">
          <span className="text-muted">{r.label}</span>
          <span className="font-medium text-heading">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
