"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import {
  Button,
  Select,
  StatusBadge,
} from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { PageHeader, FilterToolbar } from "@/components/admin-list";
import toast from "react-hot-toast";

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

const statusOptions = [
  { value: "all", label: "Tümü" },
  { value: "pending", label: "Beklemede" },
  { value: "label_created", label: "Etiket Oluşturuldu" },
  { value: "picked_up", label: "Alındı" },
  { value: "in_transit", label: "Yolda" },
  { value: "at_delivery_branch", label: "Şubede" },
  { value: "out_for_delivery", label: "Dağıtımda" },
  { value: "delivered", label: "Teslim Edildi" },
  { value: "failed", label: "Başarısız" },
  { value: "return_in_progress", label: "İade Süreci" },
  { value: "returned", label: "İade Edildi" },
  { value: "cancelled", label: "İptal" },
];

const legOptions = [
  { value: "all", label: "Tüm Yönler" },
  { value: "to_warehouse", label: "Depoya" },
  { value: "from_warehouse", label: "Kullanıcıya" },
  { value: "return", label: "İade" },
];

const legLabels: Record<string, string> = {
  to_warehouse: "Depoya",
  from_warehouse: "Kullanıcıya",
  return: "İade",
};

// Local status config – mirrors ShipmentStatus enum semantics
const shipmentStatusConfig: Record<string, StatusConfig> = {
  pending: { label: "Beklemede", variant: "secondary" },
  label_created: { label: "Etiket Oluşturuldu", variant: "secondary" },
  picked_up: { label: "Alındı", variant: "info" },
  in_transit: { label: "Yolda", variant: "info" },
  at_delivery_branch: { label: "Şubede", variant: "info" },
  out_for_delivery: { label: "Dağıtımda", variant: "info" },
  delivered: { label: "Teslim Edildi", variant: "success" },
  failed: { label: "Başarısız", variant: "danger" },
  return_in_progress: { label: "İade Süreci", variant: "warning" },
  returned: { label: "İade Edildi", variant: "secondary" },
  cancelled: { label: "İptal", variant: "danger" },
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} gün önce`;
  return d.toLocaleDateString("tr-TR");
}

const PAGE_SIZE = 20;

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
      <StatusBadge
        status={row.original.status}
        config={shipmentStatusConfig}
      />
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

export default function TradeShipmentsPage() {
  const [rows, setRows] = useState<TradeShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [leg, setLeg] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Debounce trade-number search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await adminApi.getTradeShipments({
          page,
          limit: PAGE_SIZE,
          status: status === "all" ? undefined : status,
          leg: leg === "all" ? undefined : leg,
          tradeNumber: debouncedSearch || undefined,
        });
        if (cancelled) return;
        const data: TradeShipmentRow[] = response.data?.data ?? [];
        const meta = response.data?.meta ?? {};
        setRows(data);
        setTotal(meta.total ?? data.length);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Trade shipments load error:", error);
        }
        toast.error("Takas kargoları yüklenemedi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [page, status, leg, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader title="Takas Kargoları" description={`Toplam ${total} kargo`} />

      {/* Filters */}
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Takas No ile ara..."
      >
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-56"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Select
          value={leg}
          onChange={(e) => {
            setLeg(e.target.value);
            setPage(1);
          }}
          className="sm:w-44"
        >
          {legOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </FilterToolbar>

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        emptyText={
          debouncedSearch || status !== "all" || leg !== "all"
            ? "Filtreye uygun kargo bulunamadı"
            : "Henüz takas kargosu yok"
        }
        getRowId={(r) => r.id}
      />

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            Sayfa {page} / {totalPages} ({total} sonuç)
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Önceki
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Sonraki
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
