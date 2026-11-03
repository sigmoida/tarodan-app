"use client";

import { Bar } from "react-chartjs-2";
import { useTranslations } from "next-intl";
import type { SellerTrustLabPopulationSummary } from "@tarodan/types";
import { fmtNumber } from "@/lib/format";
import {
  chartOptions,
  chartPalette,
} from "@/app/(admin)/analytics/_lib/charts";
import { histogramBars } from "../_lib/populationMappers";

/** Stored against candidate counts per score bucket (admin chart palette). */
export function PopulationHistogram({
  histogram,
}: {
  histogram: SellerTrustLabPopulationSummary["histogram"];
}) {
  const t = useTranslations();
  const bars = histogramBars(histogram, t);
  const P = "admin.system.sellerTrustLab.population";

  const data = {
    labels: bars.map((b) => b.label),
    datasets: [
      {
        label: t(`${P}.colStored`),
        data: bars.map((b) => b.stored),
        backgroundColor: chartPalette.primary,
        borderRadius: 4,
      },
      {
        label: t(`${P}.colCandidate`),
        data: bars.map((b) => b.candidate),
        backgroundColor: chartPalette.warning,
        borderRadius: 4,
      },
    ],
  };
  const options = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      legend: { display: true },
      tooltip: {
        callbacks: {
          label: (item: {
            dataset: { label?: string };
            parsed: { y: number };
          }) => `${item.dataset.label}: ${fmtNumber(item.parsed.y) ?? "0"}`,
        },
      },
    },
  };

  return (
    <div className="h-64" role="img" aria-label={t(`${P}.histogram`)}>
      <Bar data={data} options={options} />
    </div>
  );
}
