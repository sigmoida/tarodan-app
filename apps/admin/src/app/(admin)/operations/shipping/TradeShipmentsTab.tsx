"use client";

import { StatusBadge } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { col } from "@/components/table";
import {
  shipmentStatusConfig,
  statusOptions,
  legOptions,
  legLabels,
  formatRelative,
} from "./_shared";

interface TradeShipmentRow {
  id: string;
  tradeId: string;
  carrier: string;
  trackingNumber: string | null;
  status: string;
  leg: string;
  recipientType: string;
  updatedAt: string;
  trade: { id: string; tradeNumber: string | null; status: string } | null;
  shipper: { id: string; displayName: string; email: string } | null;
  recipientUser: { id: string; displayName: string; email: string } | null;
}

const columns = [
  col.link<TradeShipmentRow>("Takas No", (r) =>
    r.trade
      ? {
          href: `/operations/trades/${r.trade.id}`,
          label: r.trade.tradeNumber || `#${r.trade.id.slice(0, 8)}`,
        }
      : null,
  ),
  col.text<TradeShipmentRow>("Yön", (r) => legLabels[r.leg] || r.leg, { grow: 2 }),
  col.text<TradeShipmentRow>("Kargo", (r) => r.carrier, { grow: 1 }),
  col.code<TradeShipmentRow>("Takip No", (r) => r.trackingNumber),
  col.badge<TradeShipmentRow>("Durum", (r) => (
    <StatusBadge status={r.status} config={shipmentStatusConfig} />
  )),
  col.user<TradeShipmentRow>("Gönderici", (r) =>
    r.shipper ? { name: r.shipper.displayName, href: `/users/${r.shipper.id}` } : null,
  ),
  col.muted<TradeShipmentRow>("Güncelleme", (r) => formatRelative(r.updatedAt), { grow: 1, minWidth: 130 }),
];

export function TradeShipmentsTab() {
  return (
    <ResourceList<TradeShipmentRow>
      resource="trade-shipments"
      fetcher={({ search: q, ...params }) =>
        adminApi.getTradeShipments({ ...params, tradeNumber: q || undefined })
      }
      getRowId={(r) => r.id}
      initialFilters={{ status: "all", leg: "all" }}
      errorMessage="Takas kargoları yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect name="status" options={statusOptions} className="sm:w-56" />
        <ResourceList.FilterSelect name="leg" options={legOptions} className="sm:w-44" />
      </ResourceList.Toolbar>
      <ResourceList.Table columns={columns} emptyText="Takas kargosu bulunamadı" />
      <ResourceList.Total unit="kargo" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
