"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChartBarIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { Button, Input, Select } from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";

interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  failureReason?: string;
  providerPaymentId?: string;
  buyer: {
    id: string;
    displayName: string;
    email: string;
  };
  seller: {
    id: string;
    displayName: string;
    email: string;
  };
  product: {
    id: string;
    title: string;
  };
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Bekliyor", color: "text-warning-600", bg: "bg-warning-100" },
  processing: { label: "İşleniyor", color: "text-info-600", bg: "bg-info-100" },
  completed: { label: "Tamamlandı", color: "text-success-600", bg: "bg-success-100" },
  failed: { label: "Başarısız", color: "text-danger-600", bg: "bg-danger-100" },
  refunded: { label: "İade Edildi", color: "text-muted", bg: "bg-surface-alt" },
};

function mapPayments(raw: any[]): Payment[] {
  return raw.map((p: any) => ({
    id: p.id,
    orderId: p.orderId,
    orderNumber: p.orderNumber,
    amount: Number(p.amount || 0),
    currency: p.currency,
    provider: p.provider,
    status: p.status,
    failureReason: p.failureReason,
    providerPaymentId: p.providerPaymentId,
    buyer: p.buyer || { id: "", displayName: "", email: "" },
    seller: p.seller || { id: "", displayName: "", email: "" },
    product: p.product || { id: "", title: "" },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    paidAt: p.paidAt,
  }));
}

export default function AdminPaymentsPage() {
  const router = useRouter();
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
    queryKey: "payments",
    fetcher: (params) => adminApi.getPayments(params),
    limit: 20,
    initialFilters: { status: "", provider: "", startDate: "", endDate: "" },
    errorMessage: "Ödemeler yüklenemedi",
  });

  const payments: Payment[] = useMemo(() => mapPayments(rawRows), [rawRows]);

  const columns: ColumnDef<Payment, any>[] = [
    {
      header: "Sipariş No",
      cell: ({ row }) => (
        <Link
          href={`/orders/${row.original.orderId}`}
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          #{row.original.orderNumber}
        </Link>
      ),
    },
    {
      header: "Alıcı / Satıcı",
      cell: ({ row }) => (
        <div className="text-sm">
          <p className="font-medium text-heading">
            Alıcı: {row.original.buyer.displayName}
          </p>
          <p className="text-muted text-xs">{row.original.buyer.email}</p>
          <p className="font-medium text-heading mt-1">
            Satıcı: {row.original.seller.displayName}
          </p>
          <p className="text-muted text-xs">{row.original.seller.email}</p>
        </div>
      ),
    },
    {
      header: "Tutar",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-heading whitespace-nowrap">
          ₺
          {row.original.amount.toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      header: "Sağlayıcı",
      cell: ({ row }) => (
        <span className="text-sm text-muted uppercase">
          {row.original.provider}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => {
        const info =
          statusConfig[row.original.status] || statusConfig.pending;
        return (
          <div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${info.color} ${info.bg}`}
            >
              {info.label}
            </span>
            {row.original.failureReason && (
              <p className="text-xs text-danger-600 mt-1">
                {row.original.failureReason}
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted">
          {new Date(row.original.createdAt).toLocaleDateString("tr-TR", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
  ];

  return (
    <ResourceListPage<Payment>
      title="Ödeme Yönetimi"
      description={`Toplam ${total} ödeme`}
      headerActions={
        <Link
          href="/payments/statistics"
          className="px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 flex items-center gap-2"
        >
          <ChartBarIcon className="w-5 h-5" />
          İstatistikler
        </Link>
      }
      search={{ placeholder: "İşlem no, sipariş no veya kullanıcı ara..." }}
      searchValue={search}
      onSearchChange={setSearch}
      onSearchSubmit={onSearchSubmit}
      filters={
        <>
          <Select
            value={filters.status ?? ""}
            onChange={(e) => setFilter("status", e.target.value)}
            className="sm:w-44"
          >
            <option value="">Tüm Durumlar</option>
            <option value="pending">Bekliyor</option>
            <option value="processing">İşleniyor</option>
            <option value="completed">Tamamlandı</option>
            <option value="failed">Başarısız</option>
            <option value="refunded">İade Edildi</option>
          </Select>

          <Select
            value={filters.provider ?? ""}
            onChange={(e) => setFilter("provider", e.target.value)}
            className="sm:w-36"
          >
            <option value="">Tüm Sağlayıcılar</option>
            <option value="paytr">PayTR</option>
          </Select>

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
      data={payments}
      loading={isLoading}
      emptyText="Ödeme bulunamadı"
      getRowId={(p) => p.id}
      onRowClick={(p) => router.push(`/payments/${p.id}`)}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
