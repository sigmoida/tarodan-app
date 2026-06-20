"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { Input } from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";

// ─── Tipler ────────────────────────────────────────────────────────────────

interface Refund {
  id: string;
  amount: number;
  status: string;
  refundedAt: string;
  order: {
    id: string;
    buyer: { id: string; displayName: string; email: string };
    seller: { id: string; displayName: string; email: string };
    product: { id: string; title: string };
  } | null;
}

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function RefundsPage() {
  const router = useRouter();
  // Tarih filtreleri initialFilters'a alındı — hook bunları fetcher'a iletir
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
  } = useAdminResource<Refund>({
    queryKey: "refunds",
    fetcher: (params) =>
      adminApi.getRefundHistory({
        search: params.search,
        startDate: params.startDate || undefined,
        endDate: params.endDate || undefined,
        page: params.page,
        limit: params.limit,
      }),
    limit: 20,
    initialFilters: { startDate: "", endDate: "" },
    errorMessage: "İade geçmişi yüklenemedi",
  });

  // ── Kolon tanımları ────────────────────────────────────────────────────────
  const columns: ColumnDef<Refund, any>[] = [
    {
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.id.slice(0, 8)}...</span>
      ),
    },
    {
      header: "Tutar",
      cell: ({ row }) => (
        <span className="font-medium text-danger-600">
          ₺{row.original.amount.toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      header: "Alıcı",
      cell: ({ row }) =>
        row.original.order?.buyer ? (
          <Link
            href={`/users/${row.original.order.buyer.id}`}
            className="text-heading hover:text-primary-400"
          >
            {row.original.order.buyer.displayName}
          </Link>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      header: "Satıcı",
      cell: ({ row }) =>
        row.original.order?.seller ? (
          <Link
            href={`/users/${row.original.order.seller.id}`}
            className="text-heading hover:text-primary-400"
          >
            {row.original.order.seller.displayName}
          </Link>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      header: "Ürün",
      cell: ({ row }) => (
        <span className="block max-w-[200px] truncate">
          {row.original.order?.product?.title || "-"}
        </span>
      ),
    },
    {
      header: "İade Tarihi",
      cell: ({ row }) =>
        new Date(row.original.refundedAt).toLocaleDateString("tr-TR"),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ResourceListPage<Refund>
      title="İade Geçmişi"
      description="Tamamlanmış iadeler"
      search={{ placeholder: "Alıcı veya satıcı ara..." }}
      searchValue={search}
      onSearchChange={setSearch}
      onSearchSubmit={onSearchSubmit}
      filters={
        <>
          <Input
            type="date"
            value={filters.startDate ?? ""}
            onChange={(e) => setFilter("startDate", e.target.value)}
            className="sm:w-40"
          />
          <Input
            type="date"
            value={filters.endDate ?? ""}
            onChange={(e) => setFilter("endDate", e.target.value)}
            className="sm:w-40"
          />
        </>
      }
      columns={columns}
      data={rows}
      loading={isLoading}
      emptyText="İade bulunamadı"
      getRowId={(r) => r.id}
      onRowClick={(r) =>
        r.order && router.push(`/orders/${r.order.id}`)
      }
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
