/** @format */

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Select,
  DatePicker,
  enumLabel,
  paymentStatusConfig,
  paymentProviderConfig,
} from "@tarodan/ui";
import { PageLoading } from "@/components/PageLoading";
import {
  CurrencyDollarIcon,
  CreditCardIcon,
  CheckCircleIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { SectionCard } from "@/components/detail/SectionCard";
import { MetricCard } from "@/components/MetricCard";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";

interface PaymentStatistics {
  period: string;
  startDate: string;
  endDate: string;
  summary: {
    totalPayments: number;
    completedPayments: number;
    failedPayments: number;
    pendingPayments: number;
    totalRevenue: number;
    averageAmount: number;
    successRate: number;
  };
  byProvider: Array<{
    provider: string;
    count: number;
    totalAmount: number;
    percentage: number;
  }>;
  byStatus: Array<{ status: string; count: number; percentage: number }>;
}

function DistBar({
  label,
  count,
  percentage,
}: {
  label: string;
  count: number;
  percentage: number;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-sm font-medium text-body">{label}</span>
        <span className="text-sm text-muted">
          {count} ({percentage.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-alt">
        <div
          className="h-2 rounded-full bg-primary-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function StatisticsTab() {
  const t = useTranslations();
  const periodOptions = [
    { value: "daily", label: t("admin.finance.payments.period.daily") },
    { value: "weekly", label: t("admin.finance.payments.period.weekly") },
    { value: "monthly", label: t("admin.finance.payments.period.monthly") },
  ];
  const [filters, setFilters] = useState<{
    period: "daily" | "weekly" | "monthly";
    startDate: string;
    endDate: string;
  }>({ period: "monthly", startDate: "", endDate: "" });

  const { data, isLoading } = useQuery({
    queryKey: adminKeys.list("payment-statistics", filters),
    queryFn: async () =>
      (
        await adminApi.getPaymentStatistics({
          period: filters.period,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
        })
      ).data as PaymentStatistics,
  });

  const s = data?.summary;

  return (
    <div className="space-y-4">
      {data && (
        <p className="text-sm text-muted">
          {new Date(data.startDate).toLocaleDateString(t("common.dateLocale"))}{" "}
          - {new Date(data.endDate).toLocaleDateString(t("common.dateLocale"))}
        </p>
      )}

      <SectionCard>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Select
            label={t("admin.finance.payments.periodLabel")}
            value={filters.period}
            onChange={(e) =>
              setFilters({
                ...filters,
                period: e.target.value as typeof filters.period,
              })
            }
            options={periodOptions}
          />
          <DatePicker
            label={t("admin.finance.common.startDate")}
            value={filters.startDate}
            onChange={(v) => setFilters({ ...filters, startDate: v })}
          />
          <DatePicker
            label={t("admin.finance.common.endDate")}
            value={filters.endDate}
            onChange={(v) => setFilters({ ...filters, endDate: v })}
          />
          <div className="flex items-end">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() =>
                setFilters({ period: "monthly", startDate: "", endDate: "" })
              }
            >
              {t("common.reset")}
            </Button>
          </div>
        </div>
      </SectionCard>

      {isLoading || !data || !s ? (
        <PageLoading />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={CurrencyDollarIcon}
              tone="success"
              label={t("admin.finance.payments.totalRevenue")}
              value={fmtTry(s.totalRevenue)}
            />
            <MetricCard
              icon={CreditCardIcon}
              tone="info"
              label={t("admin.finance.payments.totalPayments")}
              value={s.totalPayments}
            />
            <MetricCard
              icon={CheckCircleIcon}
              tone="success"
              label={t("admin.finance.payments.successRate")}
              value={`${s.successRate.toFixed(1)}%`}
            />
            <MetricCard
              icon={ChartBarIcon}
              tone="primary"
              label={t("admin.finance.payments.averageAmount")}
              value={fmtTry(s.averageAmount)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard
              title={t("admin.finance.payments.statusDistribution")}
              bodyClassName="space-y-3"
            >
              {data.byStatus.map((item) => (
                <DistBar
                  key={item.status}
                  label={enumLabel(paymentStatusConfig, item.status)}
                  count={item.count}
                  percentage={item.percentage}
                />
              ))}
            </SectionCard>

            <SectionCard
              title={t("admin.finance.payments.providerDistribution")}
              bodyClassName="space-y-3"
            >
              {data.byProvider.map((item) => (
                <div key={item.provider}>
                  <DistBar
                    label={enumLabel(paymentProviderConfig, item.provider)}
                    count={item.count}
                    percentage={item.percentage}
                  />
                  <p className="mt-1 text-xs text-muted">
                    {t("common.total")}: {fmtTry(item.totalAmount)}
                  </p>
                </div>
              ))}
            </SectionCard>
          </div>

          <SectionCard title={t("admin.finance.payments.detailedSummary")}>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="min-w-0 rounded-lg bg-success-50 p-4">
                <p className="mb-1 truncate text-sm text-muted">
                  {t("admin.finance.payments.completed")}
                </p>
                <p className="truncate text-2xl font-bold text-success-600">
                  {s.completedPayments}
                </p>
              </div>
              <div className="min-w-0 rounded-lg bg-danger-50 p-4">
                <p className="mb-1 truncate text-sm text-muted">
                  {t("admin.finance.payments.failed")}
                </p>
                <p className="truncate text-2xl font-bold text-danger-600">
                  {s.failedPayments}
                </p>
              </div>
              <div className="min-w-0 rounded-lg bg-warning-50 p-4">
                <p className="mb-1 truncate text-sm text-muted">
                  {t("admin.finance.payments.pending")}
                </p>
                <p className="truncate text-2xl font-bold text-warning-600">
                  {s.pendingPayments}
                </p>
              </div>
              <div className="min-w-0 rounded-lg bg-info-50 p-4">
                <p className="mb-1 truncate text-sm text-muted">
                  {t("common.total")}
                </p>
                <p className="truncate text-2xl font-bold text-info-600">
                  {s.totalPayments}
                </p>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
