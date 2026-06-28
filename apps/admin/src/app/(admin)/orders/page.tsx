"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ShoppingBagIcon,
  ChevronDownIcon,
  ChevronUpIcon,
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
  /** 'iptal' (kargo öncesi) | 'iade' (kargo sonrası). status 'refunded' olsa bile
   *  'iptal' ise rozet "İade Edildi" değil "İptal Edildi" gösterir. */
  cancellationType?: string | null;
  /** Açık iade talebi → rozet "İade Sürecinde" (sipariş 'delivered' kalsa bile). */
  activeRefundRequest?: { id: string; status: string; refundNumber?: string } | null;
  offerId?: string | null;
  checkoutGroupId?: string | null;
  groupNumber?: string | null;
  groupItemCount: number;
  productImageUrl?: string | null;
  // Sentetik grup-özet satırı alanları (gerçek sipariş değil; sepeti temsil eder).
  isGroupSummary?: boolean;
  groupTotalAmount?: number;
  groupCommission?: number;
  groupSellers?: { id: string; displayName: string }[];
  groupStatus?: "ongoing" | "done";
  groupThumbs?: string[];
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
    cancellationType: o.cancellationType ?? null,
    activeRefundRequest: o.activeRefundRequest ?? null,
    offerId: o.offerId ?? null,
    checkoutGroupId: o.checkoutGroupId ?? null,
    groupNumber: o.groupNumber ?? null,
    groupItemCount: Number(o.groupItemCount || 1),
    productImageUrl: o.productImageUrl ?? null,
  }));
}

export default function OrdersPage() {
  const router = useRouter();
  // Inline status edit state (mutation-only, not list state)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  // Açık checkout grupları (checkoutGroupId set'i). Varsayılan kapalı: grup yalnız
  // özet (ilk) satırıyla görünür; chevron'a tıklanınca üye satırları açılır.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

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

  // Çoklu-ürün gruplarını SENTETİK bir "sepet özeti" satırına indir: özet satır
  // grubu temsil eder (durum=devam/bitti, tutar=toplam, satıcı=ilk +N, 4 thumbnail).
  // Grup açıkken (expandedGroups) özetin altında grubun TÜM siparişleri ayrı satır
  // olur. Tek-ürünlü siparişler aynen kalır. Grup üyeleri listede bitişik gelir.
  const { displayRows, rowClassById } = useMemo(() => {
    const rows: Order[] = [];
    const classMap = new Map<string, string>();
    const BAND = "bg-primary-50/30 border-l-2 border-l-primary-300";
    const TERMINAL = ["completed", "cancelled", "refunded"];
    let i = 0;
    while (i < orders.length) {
      const o = orders[i];
      const gid = o.checkoutGroupId;
      if (gid && o.groupItemCount > 1) {
        const members: Order[] = [];
        let j = i;
        while (j < orders.length && orders[j].checkoutGroupId === gid) {
          members.push(orders[j]);
          j++;
        }
        const sellersMap = new Map<string, { id: string; displayName: string }>();
        for (const m of members) if (m.seller?.id) sellersMap.set(m.seller.id, m.seller);
        const thumbs: string[] = [];
        for (const m of members) if (thumbs.length < 4 && m.productImageUrl) thumbs.push(m.productImageUrl);
        const summary: Order = {
          ...o,
          id: `grp:${gid}`,
          isGroupSummary: true,
          checkoutGroupId: gid,
          groupTotalAmount: members.reduce((s, m) => s + (m.totalAmount || 0), 0),
          groupCommission: members.reduce((s, m) => s + (m.commission || 0), 0),
          groupSellers: Array.from(sellersMap.values()),
          groupStatus: members.every((m) => TERMINAL.includes(m.status)) ? "done" : "ongoing",
          groupThumbs: thumbs,
        };
        rows.push(summary);
        // Kapalıyken grup özeti normal sipariş satırı gibi görünür (band YOK) → tekli
        // satıra benzer. Açılınca özet + üyeler hafif band ile gruplandığı belli olur.
        if (expandedGroups.has(gid)) {
          classMap.set(summary.id, BAND);
          for (const m of members) {
            rows.push(m);
            classMap.set(m.id, BAND);
          }
        }
        i = j;
      } else {
        rows.push(o);
        i++;
      }
    }
    return { displayRows: rows, rowClassById: classMap };
  }, [orders, expandedGroups]);

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
      cell: ({ row }) => {
        const o = row.original;
        // Grup ÖZET satırı: sipariş no yerine tıklanabilir "N ürünlük sepet" etiketi
        // (tamamı accordion'u açar/kapatır). Tek/üye satırda normal sipariş no.
        if (o.isGroupSummary && o.checkoutGroupId) {
          const gid = o.checkoutGroupId;
          const isOpen = expandedGroups.has(gid);
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleGroup(gid);
              }}
              aria-expanded={isOpen}
              title={isOpen ? "Sepeti kapat" : "Sepeti aç"}
              className="flex w-fit items-center gap-1 rounded px-1 -mx-1 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary-600 hover:bg-primary-100 hover:text-primary-700"
            >
              <ShoppingBagIcon className="h-3.5 w-3.5" />
              {o.groupItemCount} ürünlük sepet
              {isOpen ? (
                <ChevronUpIcon className="h-3.5 w-3.5" />
              ) : (
                <ChevronDownIcon className="h-3.5 w-3.5" />
              )}
            </button>
          );
        }
        return (
          <Link
            href={`/orders/${o.id}`}
            className="font-mono text-sm text-primary-600 hover:underline"
          >
            {o.orderNumber}
          </Link>
        );
      },
    },
    {
      header: "Durum",
      cell: ({ row }) =>
        row.original.isGroupSummary ? (
          // Grup durumu: tüm siparişler terminalde ise "Bitti", aksi halde "Devam ediyor".
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              row.original.groupStatus === "done"
                ? "bg-success-100 text-success-700"
                : "bg-info-100 text-info-700"
            }`}
          >
            {row.original.groupStatus === "done" ? "Bitti" : "Devam ediyor"}
          </span>
        ) : editingOrderId === row.original.id ? (
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
            {/* Açık iade varsa sipariş 'delivered' kalsa da "İade Sürecinde";
                kargo öncesi iptalde (cancellationType='iptal') "İptal Edildi". */}
            {row.original.activeRefundRequest ? (
              <StatusBadge
                status="refund_requested"
                config={orderStatusConfig}
                label="İade Sürecinde"
              />
            ) : row.original.cancellationType === "iptal" ? (
              <StatusBadge
                status="cancelled"
                config={orderStatusConfig}
                label="İptal Edildi"
              />
            ) : (
              <StatusBadge
                status={row.original.status}
                config={orderStatusConfig}
              />
            )}
            {(row.original.status === "cancelled" ||
              row.original.cancellationType === "iptal") &&
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
      cell: ({ row }) => {
        const o = row.original;
        // Grup özetinde ilk satıcı + birden fazlaysa "+N".
        if (o.isGroupSummary) {
          const sellers = o.groupSellers ?? [];
          const first = sellers[0];
          const extra = Math.max(0, sellers.length - 1);
          return (
            <span className="text-sm text-heading">
              {first?.displayName ?? "—"}
              {extra > 0 && (
                <span className="ml-1 rounded bg-surface-alt px-1 text-xs text-muted">
                  +{extra}
                </span>
              )}
            </span>
          );
        }
        return (
          <Link
            href={`/users/${o.seller.id}`}
            className="text-sm text-heading hover:text-primary-600"
          >
            {o.seller.displayName}
          </Link>
        );
      },
    },
    {
      header: "Ürün",
      cell: ({ row }) => {
        const o = row.original;
        // Grup özet satırı: tek ürün yerine grubun ilk 4 ürün thumbnail'i + "+N".
        if (o.isGroupSummary) {
          const thumbs = o.groupThumbs ?? [];
          const extra = o.groupItemCount - thumbs.length;
          return (
            <div className="flex items-center gap-1">
              {thumbs.length > 0 ? (
                thumbs.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className="h-8 w-8 rounded border border-border-subtle bg-surface-alt object-cover"
                  />
                ))
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded border border-border-subtle bg-surface-alt text-muted">
                  <ShoppingBagIcon className="h-4 w-4" />
                </span>
              )}
              {extra > 0 && (
                <span className="flex h-8 min-w-8 items-center justify-center rounded border border-border-subtle bg-surface-alt px-1 text-[11px] font-medium text-muted">
                  +{extra}
                </span>
              )}
            </div>
          );
        }
        return (
          <span
            className="text-sm text-body truncate block max-w-[180px]"
            title={row.original.product?.title}
          >
            {row.original.product?.title || `${row.original.itemCount} adet`}
          </span>
        );
      },
    },
    {
      id: "amount",
      header: () => <span className="block text-right">Tutar</span>,
      cell: ({ row }) => (
        <div className="text-right text-primary-600 font-medium text-sm tabular-nums">
          ₺
          {(row.original.isGroupSummary
            ? row.original.groupTotalAmount ?? 0
            : row.original.totalAmount
          ).toLocaleString("tr-TR")}
        </div>
      ),
    },
    {
      id: "commission",
      header: () => <span className="block text-right">Komisyon</span>,
      cell: ({ row }) => (
        <div className="text-right text-success-600 text-sm tabular-nums">
          ₺
          {(row.original.isGroupSummary
            ? row.original.groupCommission ?? 0
            : row.original.commission
          ).toLocaleString("tr-TR")}
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
      cell: ({ row }) =>
        row.original.isGroupSummary ? (
          // Grup özet satırı tek tek düzenlenmez; aç → üye siparişleri düzenle.
          <span className="block text-center text-xs text-subtle">—</span>
        ) : (
          <ActionButtons>
            <ActionIconButton
              icon={PencilIcon}
              onClick={() => startEditing(row.original)}
              title="Durumu Değiştir"
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
      data={displayRows}
      rowClassName={(o) => rowClassById.get(o.id)}
      loading={isLoading}
      emptyText={
        search || filters.status !== "all" || filters.userId
          ? "Filtreye uygun sipariş bulunamadı"
          : "Henüz sipariş yok"
      }
      getRowId={(o) => o.id}
      onRowClick={(o) => {
        // Grup özet satırına tıklama: accordion'u aç/kapat (detaya gitme).
        if (o.isGroupSummary) {
          if (o.checkoutGroupId) toggleGroup(o.checkoutGroupId);
          return;
        }
        // Satır içinde durum düzenleniyorken tıklama detaya gitmesin.
        if (editingOrderId === o.id) return;
        router.push(`/orders/${o.id}`);
      }}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
