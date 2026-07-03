"use client";

import { useRouter } from "next/navigation";
import { StatusBadge } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { col, CellCode } from "@/components/table";
import { shipmentStatusConfig, statusOptions } from "./_shared";

interface ShipmentRow {
  id: string;
  provider: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  order?: {
    id: string;
    orderNumber: string;
    buyer?: { id: string; displayName: string } | null;
  } | null;
}

const columns = [
  col.link<ShipmentRow>("Sipariş", (r) =>
    r.order ? { href: `/operations/orders/${r.order.id}`, label: `#${r.order.orderNumber}` } : null,
  ),
  col.text<ShipmentRow>("Alıcı", (r) => r.order?.buyer?.displayName),
  col.muted<ShipmentRow>("Kargo", (r) => r.provider),
  col.custom<ShipmentRow>(
    "Takip No",
    (r) =>
      r.trackingNumber && r.trackingUrl ? (
        <a
          href={r.trackingUrl}
          target="_blank"
          rel="noreferrer"
          className="block truncate font-mono text-xs text-primary-600 hover:underline"
          title={r.trackingNumber}
        >
          {r.trackingNumber}
        </a>
      ) : (
        <CellCode value={r.trackingNumber} />
      ),
    { grow: 2 },
  ),
  col.badge<ShipmentRow>("Durum", (r) => (
    <StatusBadge status={(r.status || "").toLowerCase()} config={shipmentStatusConfig} />
  )),
];

export function OrderShipmentsTab() {
  const router = useRouter();
  return (
    <ResourceList<ShipmentRow>
      resource="shipping-shipments"
      fetcher={(p) => adminApi.getShipments(p)}
      getRowId={(r) => r.id}
      initialFilters={{ status: "all" }}
      errorMessage="Gönderiler yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect name="status" options={statusOptions} className="sm:w-56" />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={columns}
        emptyText="Gönderi bulunamadı"
        onRowClick={(r) => r.order && router.push(`/operations/orders/${r.order.id}`)}
        rowClassName={(r) => (r.order ? undefined : "cursor-default")}
      />
      <ResourceList.Total unit="gönderi" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
