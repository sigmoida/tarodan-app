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
      { grow: 1, minWidth: 120 },
    ),
    col.custom<Payment>(
      t("admin.finance.payments.buyerSeller"),
      (p) => (
        <div className="text-sm">
          <p className="font-medium text-heading">
            {t("admin.finance.common.buyer")}: {p.buyer.displayName}
          </p>
          <p className="text-xs text-muted">{p.buyer.email}</p>
          <p className="mt-1 font-medium text-heading">
            {t("admin.finance.common.seller")}: {p.seller.displayName}
          </p>
          <p className="text-xs text-muted">{p.seller.email}</p>
        </div>
      ),
      { grow: 3, minWidth: 200 },
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
