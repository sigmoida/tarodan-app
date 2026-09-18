"use client";

import { Bar, Line } from "react-chartjs-2";
import { useTranslations } from "next-intl";
import { Skeleton } from "@tarodan/ui";
import type { AnalyticsSeries } from "@tarodan/types";
import { fmtNumber, fmtTry } from "@/lib/format";
import { chartOptions, chartPalette, seriesColor } from "../_lib/charts";
import { seriesLabel } from "../_lib/labels";
import type { SeriesConfig } from "../_lib/tabConfig";

/**
 * One chart, one unit. Series that share a chart share an axis, so mixing
 * money with counts is a config error — hence `SeriesConfig.format` covering
 * the whole chart rather than each line.
 *
 * Every bucket in the range arrives from the API, zeros included, so the line
 * shows a silent day as a dip instead of drawing straight through it.
 */
export function TrendChart({
  config,
  series,
  loading,
}: {
  config: SeriesConfig;
  series: AnalyticsSeries[];
  loading: boolean;
}) {
  const t = useTranslations();
  const shown = config.keys
    .map((key) => series.find((entry) => entry.key === key))
    .filter((entry): entry is AnalyticsSeries => Boolean(entry));

  if (loading) return <Skeleton className="h-72 w-full" />;
  if (shown.length === 0) return <div className="h-72" />;

  const data = {
    labels: shown[0].points.map((point) => point.bucket),
    datasets: shown.map((entry, index) => ({
      label: seriesLabel(t, entry.key),
      data: entry.points.map((point) => point.value),
      borderColor: seriesColor(index),
      backgroundColor:
        config.kind === "bar" ? seriesColor(index) : chartPalette.primaryLight,
      borderRadius: config.kind === "bar" ? 4 : undefined,
      tension: 0.35,
      fill: false,
    })),
  };

  const options = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      // More than one line needs its legend; a single line is already titled.
      legend: { display: shown.length > 1 },
      tooltip: {
        callbacks: {
          label: (item: { dataset: { label?: string }; parsed: { y: number } }) =>
            `${item.dataset.label}: ${
              config.format === "currency"
                ? (fmtTry(item.parsed.y) ?? "—")
                : (fmtNumber(item.parsed.y) ?? "0")
            }`,
        },
      },
    },
  };

  const Chart = config.kind === "bar" ? Bar : Line;

  return (
    <div className="h-72">
      <Chart data={data} options={options} />
    </div>
  );
}
