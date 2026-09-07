/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { useTranslations } from "next-intl";
import { FunnelCards } from "./_components/FunnelCards";
import { HealthStrip } from "./_components/HealthStrip";
import type { FinanceOverview } from "./_lib/types";

/**
 * Finans Özeti — "para nerede?" sorusuna tek bakışta cevap.
 *
 * Huni, para AKIŞININ sırasını takip eder: Tahsilat (alıcıdan giren ciro) →
 * Escrow'da bekleyen (satıcı payı rezerve) → Satıcıya ödenen (tamamlanan banka
 * transferi, net) → Platform geliri (ledger'dan, iadeler düşülmüş). Her kart
 * ilgili listeye götürür; sağlık şeridi müdahale isteyenleri gösterir.
 *
 * Zaman kapsamı her kartın altında yazar: akış kartları TÜM ZAMAN birikimli,
 * stok kartları (escrow) ANLIK. Aylık kırılım bu ekranın işi değil (ve henüz
 * başka bir ekranda da yok — dashboard yalnız sipariş/komisyon defterini ay
 * bazında gösterir).
 */
export default function FinanceOverviewPage() {
  const t = useTranslations();
  const { data, isLoading, isError, isFetching, refetch } =
    useQuery<FinanceOverview>({
      queryKey: adminKeys.all("finance-overview"),
      queryFn: async () => (await adminApi.getFinanceOverview()).data,
    });

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
          <FunnelCards funnel={data?.funnel} loading={isLoading} />
          {data && <HealthStrip health={data.health} />}
        </>
      )}
    </AdminPage>
  );
}
