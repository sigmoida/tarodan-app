"use client";

import { useTranslations } from "next-intl";
import { ResourceList } from "@/components/list";
import { fetchRefundRequests } from "@/lib/refund-request-query";
import {
  type RefundRequestRow,
  refundRequestColumns,
} from "../_lib/refunds/columns";
import { refundRequestFilterFields } from "../_lib/refunds/filters";
import { REFUND_REQUESTS_RESOURCE } from "../_lib/resource";

/**
 * İadeler sekmesi — eski iade talepleri listesi, olduğu gibi: aynı fetcher,
 * aynı kolonlar ve filtreler (+ Tür). Bekleyen kargo öncesi iptal talepleri de
 * burada ele alınır (Tür: İptal iadesi).
 */
export function RefundsView() {
  const t = useTranslations();
  return (
    <ResourceList<RefundRequestRow>
      resource={REFUND_REQUESTS_RESOURCE}
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
  );
}
