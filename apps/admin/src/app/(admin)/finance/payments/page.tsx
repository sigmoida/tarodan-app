/** @format */

"use client";

import { useRouter } from "next/navigation";
import {
  ArrowPathRoundedSquareIcon,
  ChartBarIcon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { ResourceList } from "@/components/list";
import { type Payment, mapPayments } from "./_lib/types";
import { paymentColumns } from "./_lib/columns";
import { paymentFilterFields } from "./_lib/filters";
import { paymentRowMenu } from "./_lib/rowActions";
import { StatisticsTab } from "./_components/StatisticsTab";
import { ReconciliationTab } from "./_components/ReconciliationTab";
import { useTranslations } from "next-intl";

/**
 * Ödemeler — tek route, üç sekme (liste · istatistik · iade mutabakatı).
 * Eskiden istatistik ve mutabakat ayrı sayfalardı; finansal bağlam
 * dağılıyordu. Eski URL'ler sekme parametresine yönlendirir.
 */
export default function PaymentsPage() {
  const t = useTranslations();
  const router = useRouter();
  const [tab, setTab] = useTabParam("list");

  const tabs = [
    {
      key: "list",
      label: t("admin.finance.payments.tabs.list"),
      icon: ListBulletIcon,
    },
    {
      key: "statistics",
      label: t("admin.finance.payments.tabs.statistics"),
      icon: ChartBarIcon,
    },
    {
      key: "reconciliation",
      label: t("admin.finance.payments.tabs.reconciliation"),
      icon: ArrowPathRoundedSquareIcon,
    },
  ];

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.finance.payments.title")}
        description={t("admin.finance.payments.subtitle")}
      />

      <AdminTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "statistics" ? (
        <StatisticsTab />
      ) : tab === "reconciliation" ? (
        <ReconciliationTab />
      ) : (
        <ResourceList<Payment>
          resource="payments"
          fetcher={(p) =>
            adminApi.getPayments(p).then((res) => {
              const root = res.data ?? {};
              const raw = root.data ?? root.items ?? [];
              const total = root.meta?.total ?? root.total ?? raw.length;
              return {
                ...res,
                data: { data: mapPayments(raw), meta: { total } },
              };
            })
          }
          getRowId={(p) => p.id}
          syncUrl
          filters={paymentFilterFields(t)}
        >
          <ResourceList.Toolbar />
          <ResourceList.Table
            columns={paymentColumns(
              paymentRowMenu(
                (p) => router.push(`/finance/payments/${p.id}`),
                t,
              ),
              t,
            )}
            emptyText={t("admin.finance.payments.empty")}
          />
          <ResourceList.Pagination />
        </ResourceList>
      )}
    </AdminPage>
  );
}
