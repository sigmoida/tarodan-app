"use client";

import Link from "next/link";
import { adminApi } from "@/lib/api";
import { Select, StatusBadge } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { FilterToolbar } from "@/components/admin-list";
import { Pagination } from "@/components/Pagination";
import { useAdminResource } from "@/hooks/useAdminResource";
import {
  shipmentStatusConfig,
  statusOptions,
  legOptions,
  legLabels,
  formatRelative,
} from "./_shared";

// ─── Tip ─────────────────────────────────────────────────────────────────────
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

const columns: ColumnDef<TradeShipmentRow, any>[] = [
  {
    header: "Takas No",
    cell: ({ row }) =>
      row.original.trade ? (
        <Link
          href={`/trades/${row.original.trade.id}`}
          className="font-mono text-sm text-primary-600 hover:underline"
        >
          {row.original.trade.tradeNumber ||
            `#${row.original.trade.id.slice(0, 8)}`}
        </Link>
      ) : (
        <span className="text-subtle text-sm">—</span>
      ),
  },
  {
    header: "Yön",
    cell: ({ row }) => (
      <span className="text-sm text-body">
        {legLabels[row.original.leg] || row.original.leg}
      </span>
    ),
  },
  {
    header: "Kargo",
    cell: ({ row }) => (
      <span className="text-sm text-body">{row.original.carrier}</span>
    ),
  },
  {
    header: "Takip No",
    cell: ({ row }) =>
      row.original.trackingNumber ? (
        <span className="font-mono text-xs text-body">
          {row.original.trackingNumber}
        </span>
      ) : (
        <span className="text-subtle text-sm">—</span>
      ),
  },
  {
    header: "Durum",
    cell: ({ row }) => (
      <StatusBadge status={row.original.status} config={shipmentStatusConfig} />
    ),
  },
  {
    header: "Gönderici",
    cell: ({ row }) =>
      row.original.shipper ? (
        <Link
          href={`/users/${row.original.shipper.id}`}
          className="text-sm text-heading hover:text-primary-600"
        >
          {row.original.shipper.displayName}
        </Link>
      ) : (
        <span className="text-subtle text-sm">—</span>
      ),
  },
  {
    header: "Güncelleme",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted">
        {formatRelative(row.original.updatedAt)}
      </span>
    ),
  },
];

export function TradeShipmentsTab() {
  const {
    rows,
    total,
    page,
    setPage,
    totalPages,
    search,
    setSearch,
    onSearchSubmit,
    filters,
    setFilter,
    isLoading,
  } = useAdminResource<TradeShipmentRow>({
    queryKey: "trade-shipments",
    // hook "search" → backend "tradeNumber"
    fetcher: ({ search: q, ...params }) =>
      adminApi.getTradeShipments({
        ...params,
        tradeNumber: q || undefined,
      }),
    limit: 20,
    initialFilters: { status: "all", leg: "all" },
    errorMessage: "Takas kargoları yüklenemedi",
  });

  return (
    <div className="space-y-4">
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={onSearchSubmit}
        searchPlaceholder="Takas No ile ara..."
      >
        <Select
          value={filters.status ?? "all"}
          onChange={(e) => setFilter("status", e.target.value)}
          className="sm:w-56"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Select
          value={filters.leg ?? "all"}
          onChange={(e) => setFilter("leg", e.target.value)}
          className="sm:w-44"
        >
          {legOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </FilterToolbar>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        emptyText="Takas kargosu bulunamadı"
        getRowId={(r) => r.id}
      />

      <p className="text-sm text-muted">Toplam {total} kargo</p>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
