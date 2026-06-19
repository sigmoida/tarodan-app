"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { cancelReasonLabel, orderOriginLabel, statusFilterOptions } from "@/lib/utils";
import {
  Button,
  Select,
  StatusBadge,
  orderStatusConfig,
} from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import {
  EyeIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { ActionButtons, ActionIconButton } from "@/components/admin-list";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  commission: number;
  buyer: { id: string; displayName: string };
  seller: { id: string; displayName: string };
  product?: { id: string; title: string };
  createdAt: string;
  itemCount: number;
  cancelReason?: string;
  offerId?: string | null;
}

// Filtre seçenekleri orderStatusConfig'ten türetilir → badge'lerle birebir tutarlı, OrderStatus enum'undan sapmaz.
const statusOptions = statusFilterOptions(orderStatusConfig);

function mapOrders(raw: any[]): Order[] {
  return raw.map((o: any) => ({
    id: o.id,
    orderNumber: o.orderNumber || `ORD-${o.id.slice(0, 8)}`,
    status: o.status,
    totalAmount: Number(o.totalAmount || o.total || 0),
    commission: Number(o.commissionAmount || 0),
    buyer: o.buyer || { id: "", displayName: "Alıcı" },
    seller: o.seller || { id: "", displayName: "Satıcı" },
    product: o.product || undefined,
    createdAt: o.createdAt,
    itemCount: o.items?.length || 1,
    cancelReason: o.cancelReason ?? undefined,
    offerId: o.offerId ?? null,
  }));
}

export default function OrdersPage() {
  // Inline status edit state (mutation-only, not list state)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

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
    refetch,
  } = useAdminResource<any>({
    queryKey: "orders",
    fetcher: (params) => adminApi.getOrders(params),
    limit: 20,
    syncUrl: true,
    // userId/productId hook filtreleri (queryKey'in parçası); ?userId=/?productId= deep-link'leri syncUrl ile yaşar.
    initialFilters: { status: "all", userId: "", productId: "" },
    errorMessage: "Siparişler yüklenemedi",
  });

  // Deep-link filtresini (ürün veya kullanıcı) temizle = filtreyi boşalt (URL'i de temizler).
  // userId/productId deep-link'leri pratikte aynı anda set olmaz; hangisi etkinse onu boşaltırız.
  const clearDeepLinkFilter = () =>
    setFilter(filters.productId ? "productId" : "userId", "");

  const orders: Order[] = useMemo(() => mapOrders(rawRows), [rawRows]);

  // Ürün/kullanıcı detayından gelen deep-link filtresinin görünür etiketi.
  // Ürün filtresinde tüm satırlar aynı ürüne ait → başlığı ilk satırdan türetiriz.
  const deepLinkFilterLabel = filters.productId
    ? `Ürüne göre filtreleniyor${orders[0]?.product?.title ? `: ${orders[0].product.title}` : ""}`
    : filters.userId
      ? "Kullanıcıya göre filtreleniyor"
      : null;

  const startEditing = (order: Order) => {
    setEditingOrderId(order.id);
    setNewStatus(order.status);
  };

  const cancelEditing = () => {
    setEditingOrderId(null);
    setNewStatus("");
  };

  const updateOrderStatus = async (orderId: string) => {
    if (!newStatus) return;
    setUpdatingStatus(true);
    try {
      await adminApi.updateOrderStatus(orderId, newStatus);
      toast.success("Sipariş durumu güncellendi");
      setEditingOrderId(null);
      refetch();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Status update error:", error);
      toast.error(error.response?.data?.message || "Durum güncellenemedi");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const columns: ColumnDef<Order, any>[] = [
    {
      header: "Sipariş No",
      cell: ({ row }) => (
        <Link
          href={`/orders/${row.original.id}`}
          className="font-mono text-sm text-primary-600 hover:underline"
        >
          {row.original.orderNumber}
        </Link>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) =>
        editingOrderId === row.original.id ? (
          <div className="flex items-center gap-1.5">
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-32"
              selectSize="sm"
              disabled={updatingStatus}
            >
              <option value="pending_payment">Ödeme Bekliyor</option>
              <option value="paid">Ödendi</option>
              <option value="preparing">Hazırlanıyor</option>
              <option value="shipped">Kargoda</option>
              <option value="delivered">Teslim Edildi</option>
              <option value="completed">Tamamlandı</option>
              <option value="cancelled">İptal</option>
            </Select>
            <Button
              variant="secondary"
              onClick={() => updateOrderStatus(row.original.id)}
              disabled={updatingStatus}
              className="p-1 text-success-600 hover:bg-success-50 rounded"
              title="Kaydet"
            >
              <CheckIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              onClick={cancelEditing}
              disabled={updatingStatus}
              className="p-1 text-danger-500 hover:bg-danger-50 rounded"
              title="İptal"
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge
              status={row.original.status}
              config={orderStatusConfig}
            />
            {row.original.status === "cancelled" &&
              cancelReasonLabel(row.original.cancelReason) && (
                <span className="text-xs text-muted">
                  {cancelReasonLabel(row.original.cancelReason)} ·{" "}
                  {orderOriginLabel(row.original.offerId)} iptali
                </span>
              )}
          </div>
        ),
    },
    {
      header: "Alıcı",
      cell: ({ row }) => (
        <Link
          href={`/users/${row.original.buyer.id}`}
          className="text-sm text-heading hover:text-primary-600"
        >
          {row.original.buyer.displayName}
        </Link>
      ),
    },
    {
      header: "Satıcı",
      cell: ({ row }) => (
        <Link
          href={`/users/${row.original.seller.id}`}
          className="text-sm text-heading hover:text-primary-600"
        >
          {row.original.seller.displayName}
        </Link>
      ),
    },
    {
      header: "Ürün",
      cell: ({ row }) => (
        <span
          className="text-sm text-body truncate block max-w-[180px]"
          title={row.original.product?.title}
        >
          {row.original.product?.title || `${row.original.itemCount} adet`}
        </span>
      ),
    },
    {
      id: "amount",
      header: () => <span className="block text-right">Tutar</span>,
      cell: ({ row }) => (
        <div className="text-right text-primary-600 font-medium text-sm tabular-nums">
          ₺{row.original.totalAmount.toLocaleString("tr-TR")}
        </div>
      ),
    },
    {
      id: "commission",
      header: () => <span className="block text-right">Komisyon</span>,
      cell: ({ row }) => (
        <div className="text-right text-success-600 text-sm tabular-nums">
          ₺{row.original.commission.toLocaleString("tr-TR")}
        </div>
      ),
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted">
          {new Date(row.original.createdAt).toLocaleDateString("tr-TR")}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="block text-center">İşlemler</span>,
      cell: ({ row }) => (
        <ActionButtons>
          <ActionIconButton
            icon={PencilIcon}
            onClick={() => startEditing(row.original)}
            title="Durumu Değiştir"
          />
          <ActionIconButton
            icon={EyeIcon}
            href={`/orders/${row.original.id}`}
            title="Detay"
          />
        </ActionButtons>
      ),
    },
  ];

  return (
    <ResourceListPage<Order>
      title="Siparişler"
      description={
        <>
          Toplam {total} sipariş
          {deepLinkFilterLabel && (
            <span className="ml-2">
              — {deepLinkFilterLabel}
              <Button
                variant="secondary"
                onClick={clearDeepLinkFilter}
                className="ml-2 text-primary-600 hover:underline"
              >
                Filtreyi kaldır
              </Button>
            </span>
          )}
        </>
      }
      search={{ placeholder: "Sipariş no, kullanıcı veya ürün ara..." }}
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
      data={orders}
      loading={isLoading}
      emptyText={
        search || filters.status !== "all" || filters.userId
          ? "Filtreye uygun sipariş bulunamadı"
          : "Henüz sipariş yok"
      }
      getRowId={(o) => o.id}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
