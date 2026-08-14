"use client";

import { Doughnut } from "react-chartjs-2";
import {
  ShoppingBagIcon,
  ChartBarIcon,
  CalendarIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { MetricCard } from "@/components/MetricCard";
import { SectionCard } from "@/components/detail/SectionCard";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { SM_MEDIA_QUERY } from "@/lib/breakpoints";
import { fmtNumber, fmtTry } from "@/lib/format";
import { chartPalette } from "../_lib/charts";

export function ProductsTab({ report }: { report: any }) {
  const t = useTranslations();
  // Below `sm` a right-side legend leaves no room for the doughnut itself;
  // switch to a bottom legend there, matching CategoryChart's pattern.
  const isNarrow = !useMediaQuery(SM_MEDIA_QUERY);
  const categoryChartData = {
    labels: report.categoryDistribution?.map((d: any) => d.name) || [],
    datasets: [
      {
        data: report.categoryDistribution?.map((d: any) => d.percentage) || [],
        backgroundColor: [
          chartPalette.primary,
          chartPalette.info,
          chartPalette.success,
          chartPalette.warning,
          chartPalette.danger,
          chartPalette.primaryDark,
        ],
        borderWidth: 0,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={ShoppingBagIcon}
          tone="info"
          label={t("admin.analytics.products.totalProducts")}
          value={fmtNumber(report.totalProducts) ?? 0}
        />
        <MetricCard
          icon={ChartBarIcon}
          tone="success"
          label={t("admin.analytics.products.activeProducts")}
          value={fmtNumber(report.activeProducts) ?? 0}
        />
        <MetricCard
          icon={CalendarIcon}
          tone="warning"
          label={t("admin.analytics.products.pendingApproval")}
          value={fmtNumber(report.pendingProducts) ?? 0}
        />
        <MetricCard
          icon={CurrencyDollarIcon}
          tone="primary"
          label={t("admin.analytics.products.avgPrice")}
          value={fmtTry(report.averagePrice) ?? "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title={t("admin.analytics.products.categoryDistributionTitle")}
        >
          <div className="h-80">
            <Doughnut
              data={categoryChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: isNarrow ? "bottom" : "right",
                    labels: { color: chartPalette.subtle },
                  },
                },
              }}
            />
          </div>
        </SectionCard>

        <SectionCard title={t("admin.analytics.products.byCategoryTitle")}>
          <div className="space-y-4">
            {report.categoryDistribution?.map((cat: any) => (
              <div
                key={cat.name}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 flex-1 truncate text-heading">
                  {cat.name}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="h-2 w-32 rounded-full bg-surface-alt">
                    <div
                      className="h-2 rounded-full bg-primary-500"
                      style={{ width: `${cat.percentage}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm text-muted">
                    {cat.count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
