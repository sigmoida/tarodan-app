"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { type Refund, refundColumns } from "./_lib/columns";
import { refundRowMenu } from "./_lib/rowActions";

export default function RefundsPage() {
  const router = useRouter();
  const t = useTranslations();
  return (
    <AdminPage>
      <PageHeader
        title={t("admin.operations.refunds.title")}
        description={t("admin.operations.refunds.description")}
      />

      <ResourceList<Refund>
        resource="refunds"
        fetcher={(p) =>
          adminApi.getRefundHistory({
            search: p.search,
            startDate: p.startDate || undefined,
            endDate: p.endDate || undefined,
            page: p.page,
            limit: p.limit,
            sortBy: p.sortBy,
            sortOrder: p.sortOrder,
          })
        }
        getRowId={(r) => r.id}
        syncUrl
        initialFilters={{ startDate: "", endDate: "" }}
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
          <ResourceList.DateRange />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={refundColumns(
            t,
            refundRowMenu(
              t,
              (orderId) => router.push(`/operations/orders/${orderId}`),
              (refundId) =>
                router.push(`/operations/refund-requests/${refundId}`),
            ),
          )}
          emptyText={t("admin.operations.refunds.empty")}
        />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
