import { Badge } from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import { type Payment, paymentStatusConfig } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function paymentColumns(rowMenu: (p: Payment) => RowActionItem[], t: T) {
  return [
    col.link<Payment>(
      t("admin.finance.common.orderNumber"),
      (p) => ({
        href: `/operations/orders/${p.orderId}`,
        label: `#${p.orderNumber}`,
      }),
      { grow: 1, minWidth: 120, sortKey: "orderNumber" },
    ),
    col.user<Payment>(
      t("admin.finance.common.buyer"),
      (p) => ({
        name: p.buyer.displayName,
        secondary: p.buyer.email,
        href: `/accounts/users/${p.buyer.id}`,
      }),
      { sortKey: "buyer.displayName" },
    ),
    col.user<Payment>(
      t("admin.finance.common.seller"),
      (p) => ({
        name: p.seller.displayName,
        secondary: p.seller.email,
        href: `/accounts/users/${p.seller.id}`,
      }),
      { sortKey: "seller.displayName" },
    ),
    col.product<Payment>(
      t("admin.catalog.common.product"),
      (p) => ({
        title: p.product.title,
        href: `/catalog/products/${p.product.id}`,
      }),
      { sortKey: "product.title" },
    ),
    col.money<Payment>(t("common.amount"), "amount"),
    col.muted<Payment>(
      t("admin.finance.payments.provider"),
      (p) => p.provider?.toUpperCase(),
      {
        sortKey: "provider",
        sortType: "text",
      },
    ),
    col.custom<Payment>(
      t("common.status"),
      (p) => (
        <div>
          <Badge status={p.status} config={paymentStatusConfig(t)} />
          {p.failureReason && (
            <p className="mt-1 text-xs text-danger-600">{p.failureReason}</p>
          )}
        </div>
      ),
      { sortKey: "status", sortType: "text" },
    ),
    col.date<Payment>(t("common.date"), "createdAt"),
    col.rowMenu<Payment>(rowMenu),
  ];
}
