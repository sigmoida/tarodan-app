"use client";

import { Line, Bar } from "react-chartjs-2";
import {
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { MetricCard } from "@/components/MetricCard";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtNumber, fmtTry } from "@/lib/format";
import { chartPalette, chartOptions } from "../_lib/charts";
import { getOrderStatusLabels } from "../_lib/types";

export function SalesTab({ report }: { report: any }) {
  const t = useTranslations();
  const orderStatusLabels = getOrderStatusLabels(t);
  const labels = report.dailyData?.map((d: any) => d.date.slice(5)) || [];

  const salesChartData = {
    labels,
    datasets: [
      {
        label: t("admin.analytics.sales.salesLabel"),
        data: report.dailyData?.map((d: any) => d.revenue) || [],
        borderColor: chartPalette.primary,
        backgroundColor: chartPalette.primaryLight,
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const ordersChartData = {
    labels,
    datasets: [
      {
        label: t("admin.analytics.sales.ordersLabel"),
        data: report.dailyData?.map((d: any) => d.orders) || [],
        backgroundColor: chartPalette.info,
        borderRadius: 4,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={ShoppingBagIcon}
          tone="info"
          label={t("admin.analytics.sales.totalOrders")}
          value={fmtNumber(report.totalOrders) ?? "—"}
        />
        <MetricCard
          icon={CurrencyDollarIcon}
          tone="success"
          label={t("admin.analytics.sales.totalRevenue")}
          value={fmtTry(report.totalRevenue) ?? "—"}
        />
        <MetricCard
          icon={ChartBarIcon}
          tone="primary"
          label={t("admin.analytics.sales.commissionRevenue")}
          value={fmtTry(report.totalCommission) ?? "—"}
        />
        <MetricCard
          icon={ArrowTrendingUpIcon}
          tone="primary"
          label={t("admin.analytics.sales.avgOrderValue")}
          value={fmtTry(report.averageOrderValue) ?? "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title={t("admin.analytics.sales.revenueChartTitle")}>
          <div className="h-80">
            <Line data={salesChartData} options={chartOptions} />
          </div>
        </SectionCard>
        <SectionCard title={t("admin.analytics.sales.orderCountTitle")}>
          <div className="h-80">
            <Bar data={ordersChartData} options={chartOptions} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title={t("admin.analytics.sales.statusDistributionTitle")}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Object.entries(report.ordersByStatus || {}).map(
            ([status, count]) => (
              <div
                key={status}
                className="rounded-lg bg-surface-alt p-4 text-center"
              >
                <p className="text-2xl font-bold text-heading">
                  {String(count)}
                </p>
                <p className="text-sm text-muted">
                  {orderStatusLabels[status] ?? status}
                </p>
              </div>
            ),
          )}
        </div>
      </SectionCard>
    </div>
  );
}
