/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";
import { HealthStrip } from "./_components/HealthStrip";
import { ReconciliationSectionView } from "./_components/ReconciliationSection";
import { ComparisonSectionView } from "./_components/ComparisonSection";
import type { FinanceOverview } from "./_lib/types";

/**
 * Finans Özeti — "para nerede?" sorusuna SAĞLAMASI olan cevap.
 *
 * Her bölümde sol toplam sağdaki bileşenlerin toplamına eşit olmak zorundadır;
 * fark 0 değilse kırmızı. Bölümler: ciro nereye gitti (tüm zaman) → satıcı
 * hakedişi nerede (anlık) → takas karşı taraf (anlık) → platform gelirinden
 * Tarodan hak edişine (şelale) → alıcı iadeleri (kırılım) → PayTR karşılaştırması.
 * Aylık kırılım ve trend bu ekranın işi değil; dashboard/analiz ekranlarında.
 */
export default function FinanceOverviewPage() {
  const t = useTranslations();
  const { data, isLoading, isError, isFetching, refetch } =
    useQuery<FinanceOverview>({
      queryKey: adminKeys.all("finance-overview"),
      queryFn: async () => (await adminApi.getFinanceOverview()).data,
    });

  const diagnostics = data?.diagnostics;
  const diagnosticItems = diagnostics
    ? [
        {
          key: "paymentsWithoutOrders" as const,
          value: diagnostics.paymentsWithoutOrders,
          bad: diagnostics.paymentsWithoutOrders > 0,
          text: String(diagnostics.paymentsWithoutOrders),
        },
        {
          key: "ordersWithoutHold" as const,
          value: diagnostics.ordersWithoutHold,
          bad: diagnostics.ordersWithoutHold > 0,
          text: String(diagnostics.ordersWithoutHold),
        },
        {
          key: "productTax" as const,
          value: diagnostics.productTaxTotal,
          bad: Math.abs(diagnostics.productTaxTotal) > 0.01,
          text: fmtTry(diagnostics.productTaxTotal) ?? "",
        },
        {
          key: "commissionLedgerDrift" as const,
          value: diagnostics.commissionLedgerDrift,
          bad: Math.abs(diagnostics.commissionLedgerDrift) > 0.01,
          text: fmtTry(diagnostics.commissionLedgerDrift) ?? "",
        },
      ].filter((d) => d.bad)
    : [];

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
        <div className="space-y-4">
          {(data?.sections ?? []).map((section) => (
            <ReconciliationSectionView
              key={section.key}
              section={section}
              syncEnabled={data?.syncEnabled ?? true}
              loading={isLoading}
            />
          ))}
          {isLoading && !data && (
            <p className="py-8 text-center text-muted">{t("common.loading")}</p>
          )}
          {data && <ComparisonSectionView comparison={data.comparison} />}
          {diagnosticItems.length > 0 && (
            <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              <p className="font-semibold">
                {t("admin.finance.overview.diagnostics.title")}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {diagnosticItems.map((d) => (
                  <li key={d.key}>
                    {t(`admin.finance.overview.diagnostics.${d.key}`)}: {d.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data && <HealthStrip health={data.health} />}
        </div>
      )}
    </AdminPage>
  );
}
