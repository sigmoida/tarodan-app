"use client";

import { useQuery } from "@tanstack/react-query";
import { BanknotesIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { MetricCard } from "@/components/MetricCard";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import { type PayoutSummary } from "../_lib/types";
import { useTranslations } from "next-intl";

export function PayoutsSummary() {
  const t = useTranslations();
  const { data } = useQuery<PayoutSummary>({
    queryKey: ["payouts-summary"],
    queryFn: async () => (await adminApi.getPayoutsSummary()).data,
  });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={BanknotesIcon}
        tone="warning"
        label={t("admin.finance.payouts.pendingTotal")}
        value={data ? fmtTry(data.totalPending) : "—"}
        footer={
          <span className="text-muted">
            {t("admin.finance.payouts.transactionCount", {
              count: data?.countHeld ?? 0,
            })}
          </span>
        }
      />
      <MetricCard
        icon={CheckCircleIcon}
        tone="success"
        label={t("admin.finance.payouts.paidTotal")}
        value={data ? fmtTry(data.totalReleased) : "—"}
        footer={
          <span className="text-muted">
            {t("admin.finance.payouts.transactionCount", {
              count: data?.countReleased ?? 0,
            })}
          </span>
        }
      />
      <SectionCard
        title={t("admin.finance.payouts.upcomingReleases")}
        className="md:col-span-2"
      >
        <ul className="space-y-1">
          {data?.nextReleases?.length ? (
            data.nextReleases.slice(0, 3).map((r) => (
              <li
                key={r.id}
                className="flex min-w-0 justify-between gap-2 text-sm text-muted"
              >
                <span className="truncate">
                  {t("admin.finance.payouts.orderShort", {
                    id: r.orderId.slice(0, 8),
                  })}
                </span>
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
      </SectionCard>
    </div>
  );
}
