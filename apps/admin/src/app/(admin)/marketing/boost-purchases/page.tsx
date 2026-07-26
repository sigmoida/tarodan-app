"use client";

import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { useTranslations } from "next-intl";
import { usePackages } from "../ad-packages/_lib/usePackages";
import { type BoostPurchase, statusFilterOptions } from "./_lib/types";
import { purchaseColumns } from "./_lib/columns";

export default function BoostPurchasesPage() {
  const t = useTranslations();
  const { data: packages } = usePackages();

  const packageOptions = [
    { value: "all", label: t("admin.marketing.boostPurchases.allPackages") },
    ...(packages ?? []).map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.marketing.boostPurchases.title")}
        description={t("admin.marketing.boostPurchases.subtitle")}
      />

      <ResourceList<BoostPurchase>
        resource="boost-purchases"
        fetcher={(params) =>
          adminApi.get("/admin/ad-packages/purchases", {
            params: {
              page: params.page,
              limit: params.limit,
              search: params.search || undefined,
              packageId:
                params.packageId && params.packageId !== "all"
                  ? params.packageId
                  : undefined,
              status:
                params.status && params.status !== "all"
                  ? params.status
                  : undefined,
            },
          })
        }
        getRowId={(p) => p.id}
        limit={20}
        syncUrl
        initialFilters={{ packageId: "all", status: "all" }}
      >
        <ResourceList.Toolbar>
          <ResourceList.Search
            placeholder={t("admin.marketing.boostPurchases.searchPlaceholder")}
          />
          <ResourceList.FilterSelect
            name="packageId"
            options={packageOptions}
            className="sm:w-48"
          />
          <ResourceList.FilterSelect
            name="status"
            options={statusFilterOptions(t)}
            className="sm:w-44"
          />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={purchaseColumns(t)}
          emptyText={t("admin.marketing.boostPurchases.empty")}
        />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
