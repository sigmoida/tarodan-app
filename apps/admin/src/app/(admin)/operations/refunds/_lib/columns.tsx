import { enumLabel, refundReasonConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, type RowActionItem } from "@/components/table";
import { statusConfig } from "@/lib/statusLabels";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * RefundRequest bazlı iade geçmişi satırı (R5: iade sipariş bazındadır).
 * Eski satır Payment bazlıydı — grup modelinde kısmi iadeler listede hiç
 * görünmüyor, görünenler de order=null ile boş kalıyordu.
 */
export interface Refund {
  id: string;
  refundNumber: string;
  orderId: string;
  orderNumber: string | null;
  amount: number;
  /** İadeyle geri çevrilen satıcı kesintisi (orijinal komisyon değil). */
  refundedSellerFee: number;
  reason: string | null;
  refundedAt: string;
  createdAt: string;
  buyer: { id: string; displayName: string; email: string } | null;
  seller: { id: string; displayName: string; email: string } | null;
  product: { id: string; title: string } | null;
}

export function refundColumns(t: T, rowMenu: (r: Refund) => RowActionItem[]) {
  return [
    col.code<Refund>(
      t("admin.operations.refunds.refundNumber"),
      (r) => r.refundNumber,
      { sortKey: "refundNumber" },
    ),
    col.link<Refund>(
      t("admin.operations.common.order"),
      (r) =>
        r.orderNumber
          ? {
              href: `/operations/orders/${r.orderId}`,
              label: `#${r.orderNumber}`,
            }
          : null,
      { sortKey: "order.orderNumber" },
    ),
    col.money<Refund>(t("common.amount"), "amount", {
      tone: "negative",
    }),
    col.money<Refund>(
      t("admin.operations.refunds.refundedFee"),
      (r) => r.refundedSellerFee,
    ),
    col.text<Refund>(t("admin.operations.refundRequests.reason"), (r) =>
      r.reason
        ? enumLabel(statusConfig(refundReasonConfig, t), r.reason, r.reason)
        : null,
    ),
    col.user<Refund>(
      t("admin.operations.common.buyer"),
      (r) =>
        r.buyer
          ? {
              name: r.buyer.displayName,
              secondary: r.buyer.email,
              href: `/accounts/users/${r.buyer.id}`,
            }
          : null,
      { sortKey: "order.buyer.displayName" },
    ),
    col.user<Refund>(
      t("admin.operations.common.seller"),
      (r) =>
        r.seller
          ? {
              name: r.seller.displayName,
              secondary: r.seller.email,
              href: `/accounts/users/${r.seller.id}`,
            }
          : null,
      { sortKey: "order.seller.displayName" },
    ),
    col.product<Refund>(
      t("admin.catalog.common.product"),
      (r) =>
        r.product
          ? {
              title: r.product.title,
              href: `/catalog/products/${r.product.id}`,
            }
          : null,
      { minWidth: 320, sortKey: "order.product.title" },
    ),
    col.date<Refund>(
      t("admin.operations.refunds.refundedAt"),
      (r) => r.refundedAt,
      { sortKey: "refundedAt", sortType: "date" },
    ),
    col.rowMenu<Refund>(rowMenu),
  ];
}
