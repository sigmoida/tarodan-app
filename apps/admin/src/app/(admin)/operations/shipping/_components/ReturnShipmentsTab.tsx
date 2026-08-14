"use client";

import { useTranslations } from "next-intl";
import { ResourceList } from "@/components/list";
import { fetchRefundRequests } from "@/lib/refund-request-query";
import { returnShipmentColumns } from "../_lib/columns";
import { returnShipmentFilterFields } from "../_lib/filters";
import type { ReturnShipmentRow } from "../_lib/types";

export function ReturnShipmentsTab() {
  const t = useTranslations();
  return (
    <ResourceList<ReturnShipmentRow>
      resource="refund-shipments"
      fetcher={fetchRefundRequests}
      getRowId={(r) => r.id}
      syncUrl
      filters={returnShipmentFilterFields(t)}
    >
      <ResourceList.Toolbar />
      <ResourceList.Table
        columns={returnShipmentColumns(t)}
        emptyText={t("admin.operations.shipping.returns.empty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
