"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { cancelReasonLabel, statusFilterOptions } from "@/lib/utils";
import {
  Button,
  Select,
  StatusBadge,
  tradeStatusConfig,
} from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import { ActionButtons } from "@/components/admin-list";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";
import { useQuery } from "@tanstack/react-query";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

// ─── Tipler ────────────────────────────────────────────────────────────────

interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiator: { id: string; displayName: string };
  receiver: { id: string; displayName: string };
  cashAmount?: number;
  hasDispute: boolean;
  createdAt: string;
  cancelReason?: string;
}

// ─── Sabitler ──────────────────────────────────────────────────────────────

// Filtrede gösterilen takas durumları — etiketler tradeStatusConfig'ten gelir (badge'lerle tutarlı).
// Ara/per-side durumlar (initiator_shipped, receiver_shipped, initiator_received, receiver_received)
// bilerek gizli: admin için gereksiz detay; badge'de yine doğru görünürler.
const TRADE_FILTER_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "awaiting_payment",
  "shipping_to_warehouse",
  "at_warehouse",
  "admin_reviewing",
  "shipping_to_recipients",
  "returning",
  "both_shipped",
  "completed",
  "disputed",
  "cancelled",
];
const statusOptions = statusFilterOptions(tradeStatusConfig, { keys: TRADE_FILTER_STATUSES });

// Local dispute config entry
const disputeConfig: Record<string, StatusConfig> = {
  disputed_override: { label: "İtirazlı", variant: "destructive" },
};

// ─── Yardımcı: API yanıtından Trade dizisine dönüştür ──────────────────────

function mapTrades(raw: any[]): Trade[] {
  return raw.map((t: any) => ({
    id: t.id,
    tradeNumber: t.tradeNumber || `TRD-${t.id.slice(0, 8)}`,
    status: t.status,
    initiator: t.initiator || { id: "", displayName: "Başlatan" },
    receiver: t.receiver || { id: "", displayName: "Alıcı" },
    cashAmount: Number(t.cashAmount || 0),
    hasDispute: !!t.dispute,
    createdAt: t.createdAt,
    cancelReason: t.cancelReason ?? undefined,
  }));
}

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function TradesPage() {
  const router = useRouter();
  // ── Veri çekme (useAdminResource) ─────────────────────────────────────────
  // status + userId hook-yönetimli filtreler (syncUrl ile URL'de yaşar: ?status= / ?userId=).
  // userId, kullanıcı detay sayfasından ?userId= deep-link'i ile gelir. queryKey'in parçası
  // olduğu için değişince doğru yeniden fetch tetikler (cache çakışması olmaz, "Filtreyi kaldır" çalışır).
  const {
    rows: rawRows,
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
  } = useAdminResource<any>({
    queryKey: "trades",
    fetcher: (params) => adminApi.getTrades(params),
    limit: 20,
    syncUrl: true,
    initialFilters: { status: "all", userId: "" },
    errorMessage: "Takaslar yüklenemedi",
  });

  // ?userId= deep-link filtresi artık hook filtresi; temizleme = filtreyi boşalt (URL'i de temizler).
  const userIdFilter = filters.userId ?? "";
  const clearUserFilter = () => setFilter("userId", "");

  // Mevcut satırları Trade tipine dönüştür
  const trades: Trade[] = useMemo(() => mapTrades(rawRows), [rawRows]);

  // ── İnceleme kuyruğu sayacı (at_warehouse) — ayrı küçük query ─────────────
  // Geçerli filtreden bağımsız: her zaman at_warehouse count'unu gösterir.
  const { data: reviewQueueData } = useQuery({
    queryKey: ["trades-review-queue-count"],
    queryFn: async () => {
      const res = await adminApi.getTrades({ page: 1, limit: 1, status: "at_warehouse" });
      const meta = res.data?.meta || {};
      const data = res.data?.data || res.data?.trades || [];
      return (meta.total ?? data.length ?? 0) as number;
    },
    staleTime: 60_000, // 1 dakika taze — fazla refetch istemiyoruz
  });
  const reviewQueueCount = reviewQueueData ?? 0;

  // ── Lokaldeki itirazlı takas sayısı ───────────────────────────────────────
  const disputedCount = trades.filter((t) => t.hasDispute).length;

  // ── Kolon tanımları ────────────────────────────────────────────────────────
  const columns: ColumnDef<Trade, any>[] = [
    {
      header: "Takas No",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.tradeNumber}</span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) =>
        row.original.hasDispute ? (
          <StatusBadge
            status="disputed_override"
            config={disputeConfig}
            label="⚠️ İtirazlı"
          />
        ) : (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={row.original.status} config={tradeStatusConfig} />
            {row.original.status === "cancelled" &&
              cancelReasonLabel(row.original.cancelReason) && (
                <span className="text-xs text-muted">
                  {cancelReasonLabel(row.original.cancelReason)}
                </span>
              )}
          </div>
        ),
    },
    {
      header: "Başlatan",
      cell: ({ row }) => (
        <Link
          href={`/users/${row.original.initiator.id}`}
          className="text-heading hover:text-primary-600"
        >
          {row.original.initiator.displayName}
        </Link>
      ),
    },
    {
      header: "Alan",
      cell: ({ row }) => (
        <Link
          href={`/users/${row.original.receiver.id}`}
          className="text-heading hover:text-primary-600"
        >
          {row.original.receiver.displayName}
        </Link>
      ),
    },
    {
      header: "Nakit",
      cell: ({ row }) =>
        row.original.cashAmount ? (
          <span className="text-primary-400">
            +₺{row.original.cashAmount.toLocaleString()}
          </span>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleDateString("tr-TR")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <ActionButtons>
          {row.original.hasDispute && (
            <Button
              variant="secondary"
              className="p-2 text-danger-600 hover:bg-danger-500/10 rounded-lg"
              title="İtirazı Çöz"
            >
              <ExclamationTriangleIcon className="h-5 w-5" />
            </Button>
          )}
        </ActionButtons>
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ResourceListPage<Trade>
      title="Takaslar"
      description={
        <>
          Toplam {total} takas
          {userIdFilter && (
            <span className="ml-2">
              — Kullanıcıya göre filtreleniyor
              <Button
                variant="secondary"
                onClick={clearUserFilter}
                className="ml-2 text-primary-600 hover:underline"
              >
                Filtreyi kaldır
              </Button>
            </span>
          )}
        </>
      }
      headerActions={
        <>
          {reviewQueueCount > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                setFilter("status", "at_warehouse");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium transition-colors ${
                filters.status === "at_warehouse"
                  ? "bg-warning-500 text-inverted border-warning-600"
                  : "bg-warning-100 text-warning-900 border-warning-400 hover:bg-warning-200"
              }`}
              title="İnceleme kuyruğunu filtrele"
            >
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
              <span>{reviewQueueCount} takas inceleme bekliyor</span>
            </Button>
          )}
          {disputedCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-danger-900/20 border border-danger-700 rounded-lg">
              <ExclamationTriangleIcon className="h-5 w-5 text-danger-600 shrink-0" />
              <span className="text-danger-600">
                {disputedCount} itirazlı takas
              </span>
            </div>
          )}
        </>
      }
      search={{ placeholder: "Takas no, başlatan veya alıcı ara..." }}
      searchValue={search}
      onSearchChange={setSearch}
      onSearchSubmit={onSearchSubmit}
      filters={
        <Select
          value={filters.status ?? "all"}
          onChange={(e) => setFilter("status", e.target.value)}
          className="sm:w-48"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      }
      columns={columns}
      data={trades}
      loading={isLoading}
      emptyText="Takas bulunamadı"
      getRowId={(t) => t.id}
      onRowClick={(t) => router.push(`/trades/${t.id}`)}
      rowClassName={(t) => (t.hasDispute ? "bg-danger-900/10" : "")}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
