import { useTranslations } from "next-intl";
import {
  Badge,
  enumLabel,
  refundReasonConfig,
  refundRequestStatusConfig,
  shipmentStatusConfig,
} from "@tarodan/ui";
import { col } from "@/components/table";

type T = ReturnType<typeof useTranslations<never>>;

export interface RefundRequestRow {
  id: string;
  refundNumber: string;
  status: string;
  amount: number | string;
  /** Adet bazlı kısmi iade: siparişin kaç adedi iade ediliyor. */
  refundQuantity?: number;
  reason: string;
  createdAt: string;
  returnStatus?: string | null;
  returnTrackingNumber?: string | null;
  refundedAt?: string | null;
  requester: { id: string; displayName: string; email: string };
  order: {
    id: string;
    orderNumber: string;
    totalAmount: number | string;
    seller: { id: string; displayName: string; email: string };
    product: { id: string; title: string; images?: { url: string }[] };
  };
}

export const refundRequestColumns = (t: T) => [
  col.link<RefundRequestRow>(
    t("admin.operations.common.refundNumber"),
    (r) => ({
      href: `/operations/refund-requests/${r.id}`,
      label: r.refundNumber,
    }),
    { sortKey: "refundNumber", sortType: "text" },
  ),
  col.link<RefundRequestRow>(
    t("admin.operations.common.order"),
    (r) => ({
      href: `/operations/orders/${r.order.id}`,
      label: r.order.orderNumber,
    }),
    { sortKey: "order.orderNumber" },
  ),
  col.product<RefundRequestRow>(
    t("admin.catalog.common.product"),
    (r) => ({
      title: r.order.product.title,
      image: r.order.product.images?.[0]?.url,
      href: `/catalog/products/${r.order.product.id}`,
    }),
    { sortKey: "order.product.title" },
  ),
  col.user<RefundRequestRow>(
    t("admin.operations.common.buyer"),
    (r) => ({
      name: r.requester?.displayName,
      secondary: r.requester?.email,
      href: r.requester?.id ? `/accounts/users/${r.requester.id}` : undefined,
    }),
    { sortKey: "requester.displayName" },
  ),
  col.user<RefundRequestRow>(
    t("admin.operations.common.seller"),
    (r) => ({
      name: r.order?.seller?.displayName,
      secondary: r.order?.seller?.email,
      href: r.order?.seller?.id
        ? `/accounts/users/${r.order.seller.id}`
        : undefined,
    }),
    { sortKey: "order.seller.displayName" },
  ),
  col.money<RefundRequestRow>(t("common.amount"), "amount"),
  col.text<RefundRequestRow>(
    t("admin.operations.refundRequests.refundQuantity"),
    (r) =>
      r.refundQuantity != null
        ? t("admin.operations.orders.itemCountUnit", {
            count: r.refundQuantity,
          })
        : null,
    { minWidth: 90 },
  ),
  col.text<RefundRequestRow>(
    t("admin.operations.refundRequests.reason"),
    (r) => enumLabel(refundReasonConfig, r.reason, r.reason),
    {
      // Sebep etiketleri uzun ("Açıklamaya Uygun Değil") ve tam okunmalı.
      minWidth: 260,
      wrap: true,
      sortKey: "reason",
      sortType: "text",
    },
  ),
  col.badge<RefundRequestRow>(
    t("common.status"),
    (r) => <Badge status={r.status} config={refundRequestStatusConfig} />,
    { sortKey: "status", sortType: "text" },
  ),
  col.badge<RefundRequestRow>(t("admin.operations.common.cargoStatus"), (r) =>
    r.returnStatus ? (
      <Badge status={r.returnStatus} config={shipmentStatusConfig} />
    ) : (
      <span className="text-subtle">—</span>
    ),
  ),
  col.code<RefundRequestRow>(
    t("admin.operations.common.trackingNumber"),
    (r) => r.returnTrackingNumber ?? undefined,
    { minWidth: 240 },
  ),
  col.date<RefundRequestRow>(
    t("admin.operations.common.createdAt"),
    "createdAt",
  ),
  col.date<RefundRequestRow>(
    t("admin.operations.common.completedAt"),
    (r) => r.refundedAt,
  ),
];
