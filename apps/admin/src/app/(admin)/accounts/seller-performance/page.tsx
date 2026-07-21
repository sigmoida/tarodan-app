/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { type Seller } from "./_lib/types";
import { sellerColumns } from "./_lib/columns";
import { SellerPerformanceSummary } from "./_components/SellerPerformanceSummary";
import { useTranslations } from "next-intl";

export default function SellerPerformancePage() {
  const t = useTranslations();
  return (
    <AdminPage>
      <PageHeader
        title={t("admin.accounts.sellerPerformance.title")}
        description={t("admin.accounts.sellerPerformance.description")}
      />
      <ResourceList<Seller>
        resource="sellers-performance"
        fetcher={(params) => adminApi.getUsers({ ...params, isSeller: true })}
        getRowId={(s) => s.id}
        syncUrl
      >
        <SellerPerformanceSummary />
        <ResourceList.Toolbar>
          <ResourceList.Search />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={sellerColumns(t)}
          emptyText={t("admin.accounts.sellerPerformance.empty")}
        />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
