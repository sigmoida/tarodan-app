/** @format */

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BanknotesIcon,
  ChartPieIcon,
  CreditCardIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { MetricCard } from "@/components/MetricCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";
import { HealthStrip } from "./_components/HealthStrip";
import type { FinanceOverview } from "./_lib/types";

/**
 * Finans Özeti — "para nerede?" sorusuna tek bakışta cevap.
 *
 * Huni, para AKIŞININ sırasını takip eder: Tahsilat (alıcıdan giren ciro) →
 * Escrow'da bekleyen (satıcı payı rezerve) → Satıcıya ödenen (tamamlanan banka
 * transferi, net) → Platform geliri (ledger'dan, iadeler düşülmüş). Her kart
 * ilgili listeye götürür; sağlık şeridi müdahale isteyenleri gösterir.
 */
export default function FinanceOverviewPage() {
  const t = useTranslations();
  const { data, isLoading, isError, isFetching, refetch } =
    useQuery<FinanceOverview>({
      queryKey: adminKeys.all("finance-overview"),
      queryFn: async () => (await adminApi.getFinanceOverview()).data,
    });

  const funnel = data?.funnel;

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.finance.overview.title")}
        description={t("admin.finance.overview.subtitle")}
      />

      {isError ? (
        <QueryErrorCard
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Link href="/finance/payments" className="block">
              <MetricCard
                icon={CreditCardIcon}
                tone="info"
                label={t("admin.finance.overview.funnel.collected")}
                value={funnel ? fmtTry(funnel.collectedTotal) : "—"}
                loading={isLoading}
                footer={
                  <span className="text-muted">
                    {t("admin.finance.overview.funnel.collectedHint", {
                      count: funnel?.collectedCount ?? 0,
                    })}
                  </span>
                }
              />
            </Link>
            <Link href="/finance/payouts?tab=escrow" className="block">
              <MetricCard
                icon={LockClosedIcon}
                tone="warning"
                label={t("admin.finance.overview.funnel.escrowHeld")}
                value={funnel ? fmtTry(funnel.escrowHeldTotal) : "—"}
                loading={isLoading}
                footer={
                  <span className="text-muted">
                    {t("admin.finance.overview.funnel.escrowHeldHint", {
                      count: funnel?.escrowHeldCount ?? 0,
                    })}
                  </span>
                }
              />
            </Link>
            <Link href="/finance/payouts?tab=transfers" className="block">
              <MetricCard
                icon={BanknotesIcon}
                tone="success"
                label={t("admin.finance.overview.funnel.transferred")}
                value={funnel ? fmtTry(funnel.transferredTotal) : "—"}
                loading={isLoading}
                footer={
                  <span className="text-muted">
                    {t("admin.finance.overview.funnel.transferredHint", {
                      count: funnel?.transferredCount ?? 0,
                    })}
                  </span>
                }
              />
            </Link>
            <Link href="/finance/commission" className="block">
              <MetricCard
                icon={ChartPieIcon}
                tone="primary"
                label={t("admin.finance.overview.funnel.platformRevenue")}
                value={funnel ? fmtTry(funnel.platformRevenueNet) : "—"}
                loading={isLoading}
                footer={
                  <span className="text-muted">
                    {t("admin.finance.overview.funnel.platformRevenueHint")}
                  </span>
                }
              />
            </Link>
          </div>

          {data && <HealthStrip health={data.health} />}
        </>
      )}
    </AdminPage>
  );
}
