"use client";

import { useTranslations } from "next-intl";
import { ResourceList } from "@/components/list";
import {
  fetchRefundRequests,
  refundStatusOptions,
} from "@/lib/refund-request-query";
import { returnShipmentColumns } from "../_lib/columns";
import type { ReturnShipmentRow } from "../_lib/types";

export function ReturnShipmentsTab() {
  const t = useTranslations();
  return (
    <ResourceList<ReturnShipmentRow>
      resource="refund-shipments"
      fetcher={fetchRefundRequests}
      getRowId={(r) => r.id}
      syncUrl
      initialFilters={{ status: "all", from: "", to: "" }}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={refundStatusOptions(t)}
          className="sm:w-56"
        />
        <ResourceList.DateRange fromName="from" toName="to" />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={returnShipmentColumns(t)}
        emptyText={t("admin.operations.shipping.returns.empty")}
      />
      <ResourceList.Total unit={t("admin.operations.shipping.returns.unit")} />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
