import { useTranslations } from "next-intl";
import {
  Badge,
  enumLabel,
  refundReasonConfig,
  refundRequestStatusConfig,
  shipmentStatusConfig,
} from "@tarodan/ui";
import {
  REFUND_REQUEST_KIND_I18N_KEYS,
  refundRequestKindOf,
} from "@tarodan/types";
import { col } from "@/components/table";
import { fmtTry } from "@/lib/format";
import { statusConfig } from "@/lib/statusLabels";

type T = ReturnType<typeof useTranslations<never>>;

export interface RefundRequestRow {
  id: string;
  refundNumber: string;
  status: string;
  /** İade politikası; `*_cancellation` → kargo öncesi iptalin iadesi. */
  policyCode?: string | null;
  amount: number | string;
  /** İadeyle geri çevrilen satıcı kesintisi (komisyon/hizmet bedeli iadesi). */
  refundedSellerFeeAmount?: number | string | null;
  /** Adet bazlı kısmi iade: siparişin kaç adedi iade ediliyor (detayda gösterilir). */
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
  // Tür: kargo öncesi iptalin iadesi mi, ürün iadesi mi (politikadan).
  col.badge<RefundRequestRow>(
    t("admin.operations.refundRequests.kind.label"),
    (r) => {
      const kind = refundRequestKindOf(r.policyCode);
      return (
        <Badge variant={kind === "cancellation" ? "warning" : "info"}>
          {t(REFUND_REQUEST_KIND_I18N_KEYS[kind])}
        </Badge>
      );
    },
    { sortKey: "policyCode", sortType: "text" },
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
  // İade tutarı + iadeyle geri çevrilen satıcı kesintisi tek hücrede.
  col.custom<RefundRequestRow>(
    t("admin.operations.refundRequests.amountAndFee"),
    (r) => {
      const fee = Number(r.refundedSellerFeeAmount ?? 0);
      return (
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tabular-nums text-danger-600">
            {fmtTry(r.amount)}
          </span>
          <span className="whitespace-nowrap text-xs tabular-nums text-muted">
            {t("admin.operations.refundRequests.feeShort")}{" "}
            <span className="font-medium text-body">
              {fee > 0 ? fmtTry(fee) : "—"}
            </span>
          </span>
        </div>
      );
    },
    {
      minWidth: 150,
      sortKey: "amount",
      sortType: "number",
      exportValue: (r) => `${r.amount} / ${r.refundedSellerFeeAmount ?? 0}`,
    },
  ),
  col.text<RefundRequestRow>(
    t("admin.operations.refundRequests.reason"),
    (r) => enumLabel(statusConfig(refundReasonConfig, t), r.reason, r.reason),
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
    (r) => (
      <Badge
        status={r.status}
        config={statusConfig(refundRequestStatusConfig, t)}
      />
    ),
    { sortKey: "status", sortType: "text" },
  ),
  col.badge<RefundRequestRow>(t("admin.operations.common.cargoStatus"), (r) =>
    r.returnStatus ? (
      <Badge
        status={r.returnStatus}
        config={statusConfig(shipmentStatusConfig, t)}
      />
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
