"use client";

import Link from "next/link";
import { adminApi } from "@/lib/api";
import { Select, StatusBadge } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { ActionButtons, ActionIconButton } from "@/components/admin-list";
import { Pagination } from "@/components/Pagination";
import { useAdminResource } from "@/hooks/useAdminResource";
import { EyeIcon } from "@heroicons/react/24/outline";
import { shipmentStatusConfig, statusOptions } from "./_shared";

// ─── Tip ─────────────────────────────────────────────────────────────────────
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

const columns: ColumnDef<ShipmentRow, any>[] = [
  {
    header: "Sipariş",
    cell: ({ row }) =>
      row.original.order ? (
        <Link
          href={`/orders/${row.original.order.id}`}
          className="font-medium text-primary-600 hover:underline"
        >
          #{row.original.order.orderNumber}
        </Link>
      ) : (
        <span className="text-subtle text-sm">—</span>
      ),
  },
  {
    header: "Alıcı",
    cell: ({ row }) => (
      <span className="text-heading">
        {row.original.order?.buyer?.displayName || "—"}
      </span>
    ),
  },
  {
    header: "Kargo",
    cell: ({ row }) => (
      <span className="text-muted">{row.original.provider || "—"}</span>
    ),
  },
  {
    header: "Takip No",
    cell: ({ row }) =>
      row.original.trackingNumber ? (
        row.original.trackingUrl ? (
          <a
            href={row.original.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-primary-600 hover:underline"
          >
            {row.original.trackingNumber}
          </a>
        ) : (
          <span className="font-mono text-xs text-body">
            {row.original.trackingNumber}
          </span>
        )
      ) : (
        <span className="text-subtle text-sm">—</span>
      ),
  },
  {
    header: "Durum",
    cell: ({ row }) => (
      <StatusBadge
        status={(row.original.status || "").toLowerCase()}
        config={shipmentStatusConfig}
      />
    ),
  },
  {
    id: "actions",
    header: "İşlemler",
    cell: ({ row }) =>
      row.original.order ? (
        <ActionButtons>
          <ActionIconButton
            icon={EyeIcon}
            href={`/orders/${row.original.order.id}`}
            title="Detay"
          />
        </ActionButtons>
      ) : (
        <span className="text-subtle text-sm">—</span>
      ),
  },
];

export function OrderShipmentsTab() {
  const {
    rows,
    total,
    page,
    setPage,
    totalPages,
    filters,
    setFilter,
    isLoading,
  } = useAdminResource<ShipmentRow>({
    queryKey: "shipping-shipments",
    fetcher: (params) => adminApi.getShipments(params),
    limit: 20,
    initialFilters: { status: "all" },
    errorMessage: "Gönderiler yüklenemedi",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
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
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        emptyText="Gönderi bulunamadı"
        getRowId={(r) => r.id}
      />

      <p className="text-sm text-muted">Toplam {total} gönderi</p>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
