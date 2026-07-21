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
    buyer: { id: string; displayName: string; email: string };
    seller: { id: string; displayName: string; email: string };
    product: { id: string; title: string };
  } | null;
}

export function refundColumns(t: T, rowMenu: (r: Refund) => RowActionItem[]) {
  return [
    col.code<Refund>(t("admin.operations.refunds.colId"), "id", {
      grow: 1,
    }),
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
    col.user<Refund>(
      t("admin.operations.common.buyer"),
      (r) =>
        r.order?.buyer
          ? {
              name: r.order.buyer.displayName,
              href: `/accounts/users/${r.order.buyer.id}`,
            }
          : null,
      { sortKey: "order.buyer.displayName" },
    ),
    col.code<Refund>(
      t("admin.operations.common.buyerId"),
      (r) => r.order?.buyer?.id,
    ),
    col.user<Refund>(
      t("admin.operations.common.seller"),
      (r) =>
        r.order?.seller
          ? {
              name: r.order.seller.displayName,
              href: `/accounts/users/${r.order.seller.id}`,
            }
          : null,
      { sortKey: "order.seller.displayName" },
    ),
    col.code<Refund>(
      t("admin.operations.common.sellerId"),
      (r) => r.order?.seller?.id,
    ),
    col.text<Refund>(
      t("admin.catalog.common.product"),
      (r) => r.order?.product?.title,
      { grow: 2, sortKey: "order.product.title" },
    ),
    col.date<Refund>(
      t("admin.operations.refunds.refundedAt"),
      (r) => r.refundedAt,
      { sortKey: "refundedAt", sortType: "date" },
    ),
    col.rowMenu<Refund>(rowMenu),
  ];
}
