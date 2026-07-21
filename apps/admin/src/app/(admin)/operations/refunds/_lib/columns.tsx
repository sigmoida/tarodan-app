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
