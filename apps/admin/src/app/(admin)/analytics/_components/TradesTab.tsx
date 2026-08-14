"use client";

import {
  ArrowsRightLeftIcon,
  ChartBarIcon,
  CalendarIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { MetricCard } from "@/components/MetricCard";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtNumber, fmtTry } from "@/lib/format";

export function TradesTab({ report }: { report: any }) {
  const t = useTranslations();
  const successRate =
    report.totalTrades && report.completedTrades
      ? ((report.completedTrades / report.totalTrades) * 100).toFixed(1)
      : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={ArrowsRightLeftIcon}
          tone="info"
          label={t("admin.analytics.trades.totalTrades")}
          value={fmtNumber(report.totalTrades) ?? "—"}
        />
        <MetricCard
          icon={ChartBarIcon}
          tone="success"
          label={t("admin.analytics.trades.completed")}
          value={fmtNumber(report.completedTrades) ?? "—"}
        />
        <MetricCard
          icon={CalendarIcon}
          tone="warning"
          label={t("admin.analytics.trades.pending")}
          value={fmtNumber(report.pendingTrades) ?? "—"}
        />
        <MetricCard
          icon={CurrencyDollarIcon}
          tone="primary"
          label={t("admin.analytics.trades.avgValue")}
          value={fmtTry(report.averageTradeValue) ?? "—"}
        />
      </div>

      <SectionCard title={t("admin.analytics.trades.statsTitle")}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-success-700 bg-success-900/20 p-4 text-center">
            <p className="text-2xl font-bold text-success-700">
              {report.completedTrades || 0}
            </p>
            <p className="text-sm text-muted">
              {t("admin.analytics.trades.completed")}
            </p>
          </div>
          <div className="rounded-lg border border-warning-700 bg-warning-900/20 p-4 text-center">
            <p className="text-2xl font-bold text-warning-700">
              {report.pendingTrades || 0}
            </p>
            <p className="text-sm text-muted">
              {t("admin.analytics.trades.pending")}
            </p>
          </div>
          <div className="rounded-lg border border-danger-700 bg-danger-900/20 p-4 text-center">
            <p className="text-2xl font-bold text-danger-600">
              {report.disputedTrades || 0}
            </p>
            <p className="text-sm text-muted">
              {t("admin.analytics.trades.disputed")}
            </p>
          </div>
          <div className="rounded-lg border border-info-700 bg-info-900/20 p-4 text-center">
            <p className="text-2xl font-bold text-info-700">{successRate}%</p>
            <p className="text-sm text-muted">
              {t("admin.analytics.trades.successRate")}
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
