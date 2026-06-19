"use client";

import Link from "next/link";
import { adminApi } from "@/lib/api";
import { Input, Select, StatusBadge } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { FilterToolbar, ActionButtons, ActionIconButton } from "@/components/admin-list";
import { Pagination } from "@/components/Pagination";
import { useAdminResource } from "@/hooks/useAdminResource";
import { EyeIcon } from "@heroicons/react/24/outline";
import { shipmentStatusConfig, formatDate } from "./_shared";

// ─── Tip ─────────────────────────────────────────────────────────────────────
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

// İade talebi durumları (refund-requests sayfasıyla aynı liste).
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tüm Durumlar" },
  { value: "pending_review", label: "İnceleniyor (Satıcı)" },
  { value: "approved", label: "Onaylandı" },
  { value: "wait_for_delivery", label: "Ürün Teslimi Bekleniyor" },
  { value: "return_shipment_open", label: "İade Kargosu Hazır" },
  { value: "return_in_transit", label: "İade Yolda" },
  { value: "return_delivered", label: "İade Ulaştı (Para Bekleniyor)" },
  { value: "disputed", label: "İtirazlı (Admin Karar)" },
  { value: "refunded", label: "Tamamlandı" },
  { value: "rejected", label: "Reddedildi" },
  { value: "cancelled", label: "İptal Edildi" },
];

const columns: ColumnDef<ReturnShipmentRow, any>[] = [
  {
    header: "İade No",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.refundNumber}</span>
    ),
  },
  {
    header: "Sipariş",
    cell: ({ row }) =>
      row.original.order ? (
        <Link
          href={`/orders/${row.original.order.id}`}
          className="text-primary-600 hover:underline"
        >
          {row.original.order.orderNumber}
        </Link>
      ) : (
        <span className="text-subtle text-sm">—</span>
      ),
  },
  {
    header: "Kargo",
    cell: ({ row }) => (
      <span className="text-sm text-body">
        {row.original.returnProvider || "—"}
      </span>
    ),
  },
  {
    header: "Takip No",
    cell: ({ row }) =>
      row.original.returnTrackingNumber ? (
        <span className="font-mono text-xs text-body">
          {row.original.returnTrackingNumber}
        </span>
      ) : (
        <span className="text-subtle text-sm">—</span>
      ),
  },
  {
    header: "Durum",
    cell: ({ row }) =>
      row.original.returnStatus ? (
        <StatusBadge
          status={row.original.returnStatus}
          config={shipmentStatusConfig}
        />
      ) : (
        <span className="text-subtle text-sm">—</span>
      ),
  },
  {
    header: "Kargoya Verildi",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted">
        {formatDate(row.original.returnShippedAt)}
      </span>
    ),
  },
  {
    header: "Teslim",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted">
        {formatDate(row.original.returnDeliveredAt)}
      </span>
    ),
  },
  {
    id: "actions",
    header: "İşlemler",
    cell: ({ row }) => (
      <ActionButtons>
        <ActionIconButton
          icon={EyeIcon}
          href={`/refund-requests/${row.original.id}`}
          title="Detay"
        />
      </ActionButtons>
    ),
  },
];

export function ReturnShipmentsTab() {
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
  } = useAdminResource<ReturnShipmentRow>({
    queryKey: "refund-shipments",
    fetcher: (params) => {
      const apiParams: Record<string, any> = {
        page: params.page,
        limit: params.limit,
      };
      if (params.search) apiParams.userSearch = params.search;
      if (params.status) apiParams.status = [params.status];
      if (params.from) apiParams.from = params.from;
      if (params.to) apiParams.to = params.to;
      return adminApi.getRefundRequests(apiParams).then((res) => {
        // Backend { items, total } döner → extractData { data, meta } bekler.
        const d = res.data?.data ?? res.data;
        if (d && "items" in d) {
          res.data = { data: d.items, meta: { total: d.total } };
        }
        return res;
      });
    },
    limit: 20,
    initialFilters: { status: "all", from: "", to: "" },
    errorMessage: "İade kargoları yüklenemedi",
  });

  return (
    <div className="space-y-4">
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={onSearchSubmit}
        searchPlaceholder="Kullanıcı ara (ad / e-posta)..."
      >
        <Select
          value={filters.status ?? "all"}
          onChange={(e) => setFilter("status", e.target.value)}
          className="sm:w-56"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={filters.from ?? ""}
          onChange={(e) => setFilter("from", e.target.value)}
          className="sm:w-40"
          aria-label="Başlangıç tarihi"
        />
        <Input
          type="date"
          value={filters.to ?? ""}
          onChange={(e) => setFilter("to", e.target.value)}
          className="sm:w-40"
          aria-label="Bitiş tarihi"
        />
      </FilterToolbar>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        emptyText="İade kargosu bulunamadı"
        getRowId={(r) => r.id}
      />

      <p className="text-sm text-muted">Toplam {total} iade talebi</p>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
