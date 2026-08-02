"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  BanknotesIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { MetricCard } from "@/components/MetricCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { SkeletonText } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import { type PayoutSummary } from "../_lib/types";
import { useTranslations } from "next-intl";

export function PayoutsSummary() {
  const t = useTranslations();
  const { data, isLoading, isError, isFetching, refetch } =
    useQuery<PayoutSummary>({
      queryKey: adminKeys.all("payouts-summary"),
      queryFn: async () => (await adminApi.getPayoutsSummary()).data,
    });

  if (isError) {
    return (
      <QueryErrorCard onRetry={() => void refetch()} isRetrying={isFetching} />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={BanknotesIcon}
        tone="warning"
        label={t("admin.finance.payouts.pendingTotal")}
        value={data ? fmtTry(data.totalPending) : "—"}
        loading={isLoading}
        footer={
          <span className="text-muted">
            {t("admin.finance.payouts.transactionCount", {
              count: data?.countHeld ?? 0,
            })}
          </span>
        }
      />
      {/* Escrow gerçeği: "released" para bankaya GİTMİŞ demek değil. Kartlar
          released-bekleyen / gerçekten transfer edilen / başarısız diye ayrışır. */}
      <MetricCard
        icon={ClockIcon}
        tone="info"
        label={t("admin.finance.payouts.releasedAwaiting")}
        value={data ? fmtTry(data.releasedAwaitingTransfer) : "—"}
        loading={isLoading}
      />
      <MetricCard
        icon={CheckCircleIcon}
        tone="success"
        label={t("admin.finance.payouts.transferredTotal")}
        value={data ? fmtTry(data.transferredTotal) : "—"}
        loading={isLoading}
        footer={
          <span className="text-muted">
            {t("admin.finance.payouts.transactionCount", {
              count: data?.transferredCount ?? 0,
            })}
          </span>
        }
      />
      <MetricCard
        icon={ExclamationTriangleIcon}
        tone={data?.failedTransferCount ? "danger" : "success"}
        label={t("admin.finance.payouts.failedTransfers")}
        value={data ? String(data.failedTransferCount) : "—"}
        loading={isLoading}
      />
      <SectionCard
        title={t("admin.finance.payouts.upcomingReleases")}
        className="md:col-span-2 lg:col-span-4"
      >
        <div className="min-h-[4.75rem]" aria-busy={isLoading || undefined}>
          {isLoading ? (
            <SkeletonText lines={3} />
          ) : (
            <ul className="space-y-1">
              {data?.nextReleases?.length ? (
                data.nextReleases.slice(0, 3).map((r) => (
                  <li
                    key={r.id}
                    className="flex min-w-0 justify-between gap-2 text-sm text-muted"
                  >
                    <Link
                      href={`/operations/orders/${r.orderId}`}
                      className="truncate text-primary-600 hover:text-primary-700"
                    >
                      {r.orderNumber
                        ? `#${r.orderNumber}`
                        : t("admin.finance.payouts.orderShort", {
                            id: r.orderId.slice(0, 8),
                          })}
                    </Link>
                    <span className="shrink-0 whitespace-nowrap">
                      {fmtTry(r.amount)} —{" "}
                      {r.releaseAt
                        ? new Date(r.releaseAt).toLocaleDateString(
                            t("common.dateLocale"),
                          )
                        : "-"}
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted">
                  {t("admin.finance.payouts.nonePending")}
                </li>
              )}
            </ul>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
