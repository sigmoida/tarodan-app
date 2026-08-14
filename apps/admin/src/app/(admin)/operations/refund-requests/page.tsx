"use client";

import { useTranslations } from "next-intl";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { fetchRefundRequests } from "@/lib/refund-request-query";
import { type RefundRequestRow, refundRequestColumns } from "./_lib/columns";
import { refundRequestFilterFields } from "./_lib/filters";

export default function RefundRequestsPage() {
  const t = useTranslations();
  return (
    <AdminPage>
      <PageHeader
        title={t("admin.operations.refundRequests.title")}
        description={t("admin.operations.refundRequests.description")}
      />

      <ResourceList<RefundRequestRow>
        resource="refund-requests"
        fetcher={fetchRefundRequests}
        getRowId={(rr) => rr.id}
        syncUrl
        filters={refundRequestFilterFields(t)}
      >
        <ResourceList.Toolbar />
        <ResourceList.Table
          columns={refundRequestColumns(t)}
          emptyText={t("admin.operations.refundRequests.emptyFiltered")}
        />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
