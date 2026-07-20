"use client";

import { Doughnut } from "react-chartjs-2";
import { useTranslations } from "next-intl";
import { EmptyState } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { categoryColors } from "../_lib/charts";

export function CategoryChart({
  categories,
}: {
  categories: { name: string; count: number }[];
}) {
  const t = useTranslations();
  const sorted = [...(categories || [])].sort((a, b) => b.count - a.count);
  const hasData = sorted.some((category) => category.count > 0);

  const data = {
    labels: sorted.map((c) => c.name),
    datasets: [
      {
        data: sorted.map((c) => c.count),
        backgroundColor: sorted.map(
          (_, i) => categoryColors[i % categoryColors.length],
        ),
        borderWidth: 0,
      },
    ],
  };

  return (
    <SectionCard
      title={t("admin.dashboard.charts.categoryTitle")}
      className="overflow-visible"
    >
      {hasData ? (
        <div className="min-h-[380px] pb-6">
          <Doughnut
            data={data}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              layout: { padding: { bottom: 20 } },
              plugins: {
                legend: {
                  position: "bottom",
                  labels: {
                    padding: 12,
                    boxWidth: 14,
                    font: { size: 12 },
                  },
                },
              },
            }}
          />
        </div>
      ) : (
        <EmptyState size="compact" title={t("admin.dashboard.charts.noData")} />
      )}
    </SectionCard>
  );
}
