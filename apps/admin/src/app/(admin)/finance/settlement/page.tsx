"use client";

import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { adminApi } from "@/lib/api";
import { settlementColumns } from "./_lib/columns";
import { settlementFilterFields } from "./_lib/filters";
import { type SettlementRow, mapSettlementRows } from "./_lib/types";
import { SettlementExport } from "./_components/SettlementExport";
import { useTranslations } from "next-intl";

export default function SettlementReportPage() {
  const t = useTranslations();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.finance.settlement.title")}
        description={t("admin.finance.settlement.subtitle")}
      >
        <SettlementExport />
      </PageHeader>
      <ResourceList<SettlementRow>
        resource="settlement-report"
        fetcher={(p) =>
          adminApi.getSettlementReport(p).then((res) => {
            const root = res.data ?? {};
            const raw = root.data ?? root.items ?? [];
            const total = root.meta?.total ?? root.total ?? raw.length;
            return {
              ...res,
              data: { data: mapSettlementRows(raw), meta: { total } },
            };
          })
        }
        getRowId={(r) => `${r.orderNumber}`}
        syncUrl
        filters={settlementFilterFields(t)}
      >
        <ResourceList.Toolbar
          searchPlaceholder={t("admin.finance.settlement.searchPlaceholder")}
        />
        <ResourceList.Table
          columns={settlementColumns(t)}
          emptyText={t("admin.finance.settlement.empty")}
        />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
