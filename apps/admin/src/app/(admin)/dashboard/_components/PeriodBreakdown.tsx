"use client";

import { useTranslations } from "next-intl";
import { fmtNumber } from "@/lib/format";
import type { MetricPeriods } from "../_lib/types";

/**
 * Yesterday / this-month / last-month footer for a dashboard `MetricCard`.
 * Pass a `format` fn (₺, count, …) so numeric formatting matches the parent card.
 */
export function PeriodBreakdown({
  periods,
  format = (n: number) => fmtNumber(n) ?? String(n),
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
    <div className="mt-2 grid w-full grid-cols-3 gap-1.5 text-xs">
      {rows.map((r) => (
        <div key={r.label} className="flex min-w-0 flex-col">
          <span className="truncate text-muted">{r.label}</span>
          <span className="truncate font-semibold tabular-nums text-heading">
            {format(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
