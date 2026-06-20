"use client";

import Link from "next/link";
import { adminApi } from "@/lib/api";
import {
  Input,
  Select,
  StatusBadge,
  enumLabel,
  refundReasonConfig,
  refundRequestStatusConfig,
} from "@tarodan/ui";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@/components/DataTable";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";

// ─── Tipler ────────────────────────────────────────────────────────────────

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

// ─── Sabitler ──────────────────────────────────────────────────────────────

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

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function RefundRequestsPage() {
  const router = useRouter();
  // status, from, to → backend desteklediği için initialFilters'a alındı.
  // userSearch → hook'un "search" alanına eşlendi (backend: userSearch param).
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
  } = useAdminResource<RefundRequestRow>({
    queryKey: "refund-requests",
    fetcher: (params) => {
      const apiParams: Record<string, any> = {
        page: params.page,
        limit: params.limit,
      };
      // "search" hook parametresi → userSearch API param
      if (params.search) apiParams.userSearch = params.search;
      // status: "all" atlandı (hook zaten göndermez), gerçek değerlerde array sarmalı gerekiyor
      if (params.status) apiParams.status = [params.status];
      if (params.from) apiParams.from = params.from;
      if (params.to) apiParams.to = params.to;
      return adminApi.getRefundRequests(apiParams).then((res) => {
        // Backend { items, total, page, limit } döner.
        // extractData { data, meta: { total } } bekler → normalize et.
        const d = res.data?.data ?? res.data;
        if (d && "items" in d) {
          res.data = { data: d.items, meta: { total: d.total } };
        }
        return res;
      });
    },
    limit: PAGE_SIZE,
    initialFilters: { status: "all", from: "", to: "" },
    errorMessage: "İade talepleri yüklenemedi",
  });

  // ── Kolon tanımları ────────────────────────────────────────────────────────
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
          <div>{row.original.requester?.displayName ?? "—"}</div>
          <div className="text-xs text-muted">{row.original.requester?.email ?? ""}</div>
        </>
      ),
    },
    {
      header: "Satıcı",
      cell: ({ row }) => (
        <>
          <div>{row.original.order?.seller?.displayName ?? "—"}</div>
          <div className="text-xs text-muted">{row.original.order?.seller?.email ?? ""}</div>
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
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ResourceListPage<RefundRequestRow>
      title="İade Talepleri"
      description="Aktif iade talepleri — admin müdahalesi gereken durumlar"
      search={{ placeholder: "Alıcı/satıcı adı, e-posta veya iade numarası" }}
      searchValue={search}
      onSearchChange={setSearch}
      onSearchSubmit={onSearchSubmit}
      filters={
        <>
          <Select
            value={filters.status ?? "all"}
            onChange={(e) => setFilter("status", e.target.value)}
            className="sm:w-56"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            value={filters.from ?? ""}
            onChange={(e) => setFilter("from", e.target.value)}
            className="sm:w-40"
          />
          <Input
            type="date"
            value={filters.to ?? ""}
            onChange={(e) => setFilter("to", e.target.value)}
            className="sm:w-40"
          />
        </>
      }
      columns={columns}
      data={rows}
      loading={isLoading}
      emptyText="Bu filtrelerle eşleşen iade talebi yok."
      getRowId={(rr) => rr.id}
      onRowClick={(rr) => router.push(`/refund-requests/${rr.id}`)}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
