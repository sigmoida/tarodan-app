import { enumLabel, refundReasonConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, type RowActionItem } from "@/components/table";

type T = ReturnType<typeof useTranslations<never>>;

export interface Refund {
  id: string;
  amount: number;
  status: string;
  refundedAt: string;
  order: {
    id: string;
    orderNumber: string;
    commissionAmount?: number;
    reason?: string | null;
    buyer: { id: string; displayName: string; email: string };
    seller: { id: string; displayName: string; email: string };
    product: { id: string; title: string };
  } | null;
}

export function refundColumns(t: T, rowMenu: (r: Refund) => RowActionItem[]) {
  return [
    col.link<Refund>(
      t("admin.operations.common.order"),
      (r) =>
        r.order
          ? {
              href: `/operations/orders/${r.order.id}`,
              label: r.order.orderNumber,
            }
          : null,
      { sortKey: "order.orderNumber" },
    ),
    col.money<Refund>(t("common.amount"), "amount", {
      tone: "negative",
    }),
    col.money<Refund>(
      t("admin.operations.orders.commission"),
      (r) => r.order?.commissionAmount,
    ),
    col.text<Refund>(t("admin.operations.refundRequests.reason"), (r) =>
      r.order?.reason
        ? enumLabel(refundReasonConfig, r.order.reason, r.order.reason)
        : null,
    ),
    col.user<Refund>(
      t("admin.operations.common.buyer"),
      (r) =>
        r.order?.buyer
          ? {
              name: r.order.buyer.displayName,
              secondary: r.order.buyer.email,
              href: `/accounts/users/${r.order.buyer.id}`,
            }
          : null,
      { sortKey: "order.buyer.displayName" },
    ),
    col.user<Refund>(
      t("admin.operations.common.seller"),
      (r) =>
        r.order?.seller
          ? {
              name: r.order.seller.displayName,
              secondary: r.order.seller.email,
              href: `/accounts/users/${r.order.seller.id}`,
            }
          : null,
      { sortKey: "order.seller.displayName" },
    ),
    col.product<Refund>(
      t("admin.catalog.common.product"),
      (r) =>
        r.order?.product
          ? {
              title: r.order.product.title,
              href: `/catalog/products/${r.order.product.id}`,
            }
          : null,
      { minWidth: 380, sortKey: "order.product.title" },
    ),
    col.date<Refund>(
      t("admin.operations.refunds.refundedAt"),
      (r) => r.refundedAt,
      { sortKey: "refundedAt", sortType: "date" },
    ),
    col.rowMenu<Refund>(rowMenu),
  ];
}
