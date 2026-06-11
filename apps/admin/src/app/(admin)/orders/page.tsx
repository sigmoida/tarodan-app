"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { cancelReasonLabel, orderOriginLabel } from "@/lib/utils";
import {
  Button,
  Select,
  StatusBadge,
  orderStatusConfig,
} from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import {
  EyeIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import {
  PageHeader,
  FilterToolbar,
  ActionButtons,
  ActionIconButton,
} from "@/components/admin-list";

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

const statusOptions = [
  { value: "all", label: "Tümü" },
  { value: "pending_payment", label: "Ödeme Bekliyor" },
  { value: "paid", label: "Ödendi" },
  { value: "preparing", label: "Hazırlanıyor" },
  { value: "shipped", label: "Kargoda" },
  { value: "delivered", label: "Teslim Edildi" },
  { value: "awaiting_buyer_confirmation", label: "Alıcı Onayı Bekleniyor (48h)" },
  { value: "completed", label: "Tamamlandı" },
  { value: "cancelled", label: "İptal" },
];

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlUserId = useMemo(
    () => searchParams.get("userId") || "",
    [searchParams],
  );
  const productId = useMemo(
    () => searchParams.get("productId") || undefined,
    [searchParams],
  );

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // User filter (driven by URL ?userId= deep-links, e.g. from user detail page)
  const [selectedUserId, setSelectedUserId] = useState<string>(urlUserId);

  // Debounce order search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Sync URL with state
  useEffect(() => {
    setSelectedUserId(urlUserId);
  }, [urlUserId]);

  const clearUserFilter = () => {
    setSelectedUserId("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("userId");
    router.push(`/orders?${params.toString()}`);
  };

  useEffect(() => {
    loadOrders();
  }, [page, status, selectedUserId, productId, debouncedSearch]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getOrders({
        page,
        limit: 20,
        status: status === "all" ? undefined : status,
        search: debouncedSearch || undefined,
        userId: selectedUserId || undefined,
        productId,
      });
      const data = response.data.data || response.data.orders || [];
      const meta = response.data.meta || {};
      setOrders(
        data.map((o: any) => ({
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
        })),
      );
      setTotal(meta.total || data.length);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Orders load error:", error);
      toast.error("Siparişler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

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
      loadOrders();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Status update error:", error);
      toast.error(error.response?.data?.message || "Durum güncellenemedi");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

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
    <div className="space-y-6">
      <PageHeader
        title="Siparişler"
        description={
          <>
            Toplam {total} sipariş
            {(selectedUserId || productId) && (
              <span className="ml-2">
                — Filtreleniyor
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
      />

      {/* Filters */}
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Sipariş no, kullanıcı veya ürün ara..."
      >
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-48"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </FilterToolbar>

      {/* Table */}
      <DataTable
        columns={columns}
        data={orders}
        loading={loading}
        emptyText={
          debouncedSearch || status !== "all" || selectedUserId
            ? "Filtreye uygun sipariş bulunamadı"
            : "Henüz sipariş yok"
        }
        getRowId={(o) => o.id}
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
