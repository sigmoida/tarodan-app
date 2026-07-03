"use client";

import { useRouter } from "next/navigation";
import { StatusBadge } from "@tarodan/ui";
import { ResourceList } from "@/components/list";
import { col, Empty } from "@/components/table";
import { fetchRefundRequests, REFUND_STATUS_OPTIONS } from "@/lib/refund-request-query";
import { shipmentStatusConfig } from "./_shared";

interface ReturnShipmentRow {
  id: string;
  refundNumber: string;
  status: string;
  returnProvider: string | null;
  returnTrackingNumber: string | null;
  returnStatus: string | null;
  returnShippedAt: string | null;
  returnDeliveredAt: string | null;
  order: { id: string; orderNumber: string } | null;
}

const columns = [
  col.code<ReturnShipmentRow>("İade No", (r) => r.refundNumber),
  col.link<ReturnShipmentRow>("Sipariş", (r) =>
    r.order ? { href: `/operations/orders/${r.order.id}`, label: r.order.orderNumber } : null,
  ),
  col.text<ReturnShipmentRow>("Kargo", (r) => r.returnProvider, { grow: 1 }),
  col.code<ReturnShipmentRow>("Takip No", (r) => r.returnTrackingNumber),
  col.badge<ReturnShipmentRow>("Durum", (r) =>
    r.returnStatus ? (
      <StatusBadge status={r.returnStatus} config={shipmentStatusConfig} />
    ) : (
      <Empty />
    ),
  ),
  col.date<ReturnShipmentRow>("Kargoya Verildi", (r) => r.returnShippedAt),
  col.date<ReturnShipmentRow>("Teslim", (r) => r.returnDeliveredAt),
];

export function ReturnShipmentsTab() {
  const router = useRouter();
  return (
    <ResourceList<ReturnShipmentRow>
      resource="refund-shipments"
      fetcher={fetchRefundRequests}
      getRowId={(r) => r.id}
      initialFilters={{ status: "all", from: "", to: "" }}
      errorMessage="İade kargoları yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect name="status" options={REFUND_STATUS_OPTIONS} className="sm:w-56" />
        <ResourceList.DateRange fromName="from" toName="to" />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={columns}
        emptyText="İade kargosu bulunamadı"
        onRowClick={(r) => router.push(`/operations/refund-requests/${r.id}`)}
      />
      <ResourceList.Total unit="iade talebi" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
