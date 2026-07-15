"use client";

import { useTranslations } from "next-intl";
import { ResourceList } from "@/components/list";
import {
  fetchRefundRequests,
  REFUND_STATUS_OPTIONS,
} from "@/lib/refund-request-query";
import { returnShipmentColumns } from "./_lib/columns";
import type { ReturnShipmentRow } from "./_lib/types";

export function ReturnShipmentsTab() {
  const t = useTranslations();
  return (
    <ResourceList<ReturnShipmentRow>
      resource="refund-shipments"
      fetcher={fetchRefundRequests}
      getRowId={(r) => r.id}
      initialFilters={{ status: "all", from: "", to: "" }}
      errorMessage={t("admin.operations.shipping.returns.loadError")}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={REFUND_STATUS_OPTIONS}
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
