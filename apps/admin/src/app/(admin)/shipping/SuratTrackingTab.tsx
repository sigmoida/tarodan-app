"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { Button, Select, StatusBadge } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { useAdminResource } from "@/hooks/useAdminResource";
import { shipmentStatusConfig, statusOptions, formatRelative } from "./_shared";

// ─── Tip ─────────────────────────────────────────────────────────────────────
interface SuratShipmentRow {
  id: string;
  provider: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  providerStatusCode: number | null;
  providerRawStatus: string | null;
  updatedAt: string;
  order?: {
    id: string;
    orderNumber: string;
    buyer?: { id: string; displayName: string } | null;
  } | null;
}

export function SuratTrackingTab() {
  const router = useRouter();
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const {
    rows,
    total,
    page,
    setPage,
    totalPages,
    filters,
    setFilter,
    isLoading,
    refetch,
  } = useAdminResource<SuratShipmentRow>({
    queryKey: "surat-shipments",
    // Yalnızca Sürat kargolarını getir (provider = surat → carrierId).
    fetcher: (params) => adminApi.getShipments({ ...params, carrierId: "surat" }),
    limit: 20,
    initialFilters: { status: "all" },
    errorMessage: "Sürat kargoları yüklenemedi",
  });

  async function handleSync(id: string) {
    setSyncingId(id);
    try {
      const res = await adminApi.syncShipmentTracking(id);
      const data = res.data;
      if (data?.ok) {
        toast.success(data.message || "Takip güncellendi");
      } else {
        toast(data?.message || "Sürat'tan güncelleme alınamadı");
      }
      refetch();
    } catch {
      toast.error("Takip senkronu başarısız oldu");
    } finally {
      setSyncingId(null);
    }
  }

  const columns: ColumnDef<SuratShipmentRow, any>[] = [
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
      header: "Takip No",
      cell: ({ row }) =>
        row.original.trackingNumber ? (
          row.original.trackingUrl ? (
            <a
              href={row.original.trackingUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
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
      header: "Sürat Durumu",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <StatusBadge
            status={(row.original.status || "").toLowerCase()}
            config={shipmentStatusConfig}
          />
          {row.original.providerRawStatus ? (
            <span className="text-xs text-muted">
              {row.original.providerRawStatus}
              {row.original.providerStatusCode != null
                ? ` (${row.original.providerStatusCode})`
                : ""}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      header: "Son Güncelleme",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted">
          {row.original.updatedAt ? formatRelative(row.original.updatedAt) : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          disabled={syncingId === row.original.id}
          onClick={(e) => {
            e.stopPropagation();
            handleSync(row.original.id);
          }}
        >
          {syncingId === row.original.id ? "Yenileniyor…" : "Takibi Yenile"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Sürat Kargo gönderilerinin canlı durumu. Durumlar arka planda her 30 dakikada
        bir otomatik senkronlanır; anlık güncel durum için satırdaki{" "}
        <span className="font-medium text-body">Takibi Yenile</span> düğmesini kullanın.
      </p>

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
        emptyText="Sürat kargosu bulunamadı"
        getRowId={(r) => r.id}
        onRowClick={(r) => r.order && router.push(`/orders/${r.order.id}`)}
        rowClassName={(r) => (r.order ? undefined : "cursor-default")}
      />

      <p className="text-sm text-muted">Toplam {total} Sürat gönderisi</p>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
