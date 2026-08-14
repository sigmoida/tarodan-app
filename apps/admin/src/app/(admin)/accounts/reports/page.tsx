/** @format */

"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { type Report } from "./_lib/types";
import { reportColumns } from "./_lib/columns";
import { reportFilterFields } from "./_lib/filters";

export default function ReportsPage() {
  const t = useTranslations();
  return (
    <AdminPage>
      <PageHeader
        title={t("admin.reports.title")}
        description={t("admin.reports.description")}
      />
      <ResourceList<Report>
        resource="reports"
        fetcher={(params) => adminApi.getUserReports(params)}
        getRowId={(r) => r.id}
        syncUrl
        filters={reportFilterFields(t)}
      >
        <ResourceList.Toolbar />
        <ResourceList.Table
          columns={reportColumns({ t })}
          emptyText={t("admin.reports.empty")}
        />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
