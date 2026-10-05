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
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { SectionCard } from "@/components/detail/SectionCard";
import { MetricCard } from "@/components/MetricCard";
import { ProgressBar } from "@/components/ProgressBar";
import { fmtDate, fmtPercent, fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";
import { statusConfig } from "@/lib/statusLabels";

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
          {count} ({fmtPercent(percentage, 1)})
        </span>
      </div>
      <ProgressBar value={percentage} aria-label={label} />
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
          {fmtDate(data.startDate)} - {fmtDate(data.endDate)}
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
              label={t("admin.finance.payments.totalRevenue")}
              value={fmtTry(s.totalRevenue)}
            />
            <MetricCard
              label={t("admin.finance.payments.totalPayments")}
              value={s.totalPayments}
            />
            <MetricCard
              label={t("admin.finance.payments.successRate")}
              value={fmtPercent(s.successRate, 1)}
            />
            <MetricCard
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
                  label={enumLabel(
                    statusConfig(paymentStatusConfig, t),
                    item.status,
                  )}
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
                    label={enumLabel(
                      statusConfig(paymentProviderConfig, t),
                      item.provider,
                    )}
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
              <MetricCard
                label={t("admin.finance.payments.completed")}
                value={s.completedPayments}
              />
              <MetricCard
                label={t("admin.finance.payments.failed")}
                value={s.failedPayments}
              />
              <MetricCard
                label={t("admin.finance.payments.pending")}
                value={s.pendingPayments}
              />
              <MetricCard label={t("common.total")} value={s.totalPayments} />
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
