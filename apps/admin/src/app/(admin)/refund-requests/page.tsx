"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import {
  Button,
  Input,
  Select,
  StatusBadge,
  enumLabel,
  refundReasonConfig,
  refundRequestStatusConfig,
} from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import {
  PageHeader,
  FilterToolbar,
  ActionButtons,
  ActionIconButton,
} from "@/components/admin-list";
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

interface RefundRequestRow {
  id: string;
  refundNumber: string;
  status: string;
  amount: number | string;
  reason: string;
  createdAt: string;
  requester: { id: string; displayName: string; email: string };
  order: {
    id: string;
    orderNumber: string;
    totalAmount: number | string;
    seller: { id: string; displayName: string; email: string };
    product: { id: string; title: string; images?: { url: string }[] };
  };
}

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

const PAGE_SIZE = 20;

export default function RefundRequestsPage() {
  const [items, setItems] = useState<RefundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, limit: PAGE_SIZE };
      if (status !== "all") params.status = [status];
      if (userSearch.trim()) params.userSearch = userSearch.trim();
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await adminApi.getRefundRequests(params);
      const data = res.data?.data ?? res.data;
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "İade talepleri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [status, userSearch, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: ColumnDef<RefundRequestRow, any>[] = [
    {
      header: "İade No",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.refundNumber}</span>
      ),
    },
    {
      header: "Sipariş",
      cell: ({ row }) => (
        <Link
          href={`/orders/${row.original.order.id}`}
          className="text-primary-600 hover:underline"
        >
          {row.original.order.orderNumber}
        </Link>
      ),
    },
    {
      header: "Ürün",
      cell: ({ row }) => {
        const img = row.original.order.product.images?.[0]?.url;
        return (
          <div className="flex items-center gap-2 max-w-[220px]">
            <div className="w-10 h-10 rounded-md bg-surface-alt flex items-center justify-center overflow-hidden flex-shrink-0">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img}
                  alt={row.original.order.product.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-base">📦</span>
              )}
            </div>
            <span className="text-xs truncate">{row.original.order.product.title}</span>
          </div>
        );
      },
    },
    {
      header: "Alıcı",
      cell: ({ row }) => (
        <>
          <div>{row.original.requester.displayName}</div>
          <div className="text-xs text-muted">{row.original.requester.email}</div>
        </>
      ),
    },
    {
      header: "Satıcı",
      cell: ({ row }) => (
        <>
          <div>{row.original.order.seller.displayName}</div>
          <div className="text-xs text-muted">{row.original.order.seller.email}</div>
        </>
      ),
    },
    {
      header: "Tutar",
      cell: ({ row }) => (
        <span className="font-medium">
          ₺{Number(row.original.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      header: "Sebep",
      cell: ({ row }) => (
        <span className="text-xs">
          {enumLabel(refundReasonConfig, row.original.reason, row.original.reason)}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} config={refundRequestStatusConfig} />
      ),
    },
    {
      header: "Oluşturma",
      cell: ({ row }) => (
        <span className="text-xs text-muted">
          {new Date(row.original.createdAt).toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="block text-right" />,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="İade Talepleri"
        description="Aktif iade talepleri — admin müdahalesi gereken durumlar"
      >
        <Button variant="secondary" onClick={load} className="p-2 shrink-0">
          <ArrowPathIcon className="h-5 w-5" />
        </Button>
      </PageHeader>

      {/* Filters */}
      <FilterToolbar
        search={userSearch}
        onSearchChange={setUserSearch}
        onSearchSubmit={applyFilters}
        searchPlaceholder="Alıcı/satıcı adı, e-posta veya iade numarası"
      >
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-56">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sm:w-40" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-40" />
        <Button variant="primary" onClick={applyFilters} className="shrink-0">
          <MagnifyingGlassIcon className="h-4 w-4 mr-1" />
          Filtrele
        </Button>
      </FilterToolbar>

      {/* List */}
      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        emptyText="Bu filtrelerle eşleşen iade talebi yok."
        getRowId={(rr) => rr.id}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted">
            Toplam {total} kayıt — Sayfa {page} / {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Önceki
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sonraki
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
