/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { MetricCard } from "@/components/MetricCard";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";

interface InvoicesSummaryData {
  monthIssuedCount: number;
  monthIssuedTotal: number;
  pendingCount: number;
  failedCount: number;
  exhaustedCount: number;
}

/**
 * Fatura sağlık şeridi. Kritik kart: DENEME TÜKENDİ — retry bütçesi bitmiş
 * failed belgeler yasal e-Arşiv süresi işlerken sessizce log'da kalıyordu;
 * artık burada kırmızı görünür ve satır aksiyonuyla kurtarılır.
 */
export function InvoicesSummary() {
  const t = useTranslations();
  const { data, isLoading } = useQuery<InvoicesSummaryData>({
    queryKey: adminKeys.all("invoices-summary"),
    queryFn: async () => (await adminApi.getInvoicesSummary()).data,
  });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={CheckCircleIcon}
        tone="success"
        label={t("admin.finance.invoices.monthIssued")}
        value={data ? fmtTry(data.monthIssuedTotal) : "—"}
        loading={isLoading}
        footer={
          <span className="text-muted">
            {t("admin.finance.invoices.documentCount", {
              count: data?.monthIssuedCount ?? 0,
            })}
          </span>
        }
      />
      <MetricCard
        icon={ClockIcon}
        tone="info"
        label={t("admin.finance.invoices.pendingShort")}
        value={data ? String(data.pendingCount) : "—"}
        loading={isLoading}
      />
      <MetricCard
        icon={XCircleIcon}
        tone={data?.failedCount ? "warning" : "success"}
        label={t("admin.finance.invoices.failedShort")}
        value={data ? String(data.failedCount) : "—"}
        loading={isLoading}
      />
      <MetricCard
        icon={ExclamationTriangleIcon}
        tone={data?.exhaustedCount ? "danger" : "success"}
        label={t("admin.finance.invoices.exhaustedShort")}
        value={data ? String(data.exhaustedCount) : "—"}
        loading={isLoading}
      />
    </div>
  );
}
