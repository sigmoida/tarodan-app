import Link from "next/link";
import { Badge } from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import { type Payment, paymentStatusConfig } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function paymentColumns(rowMenu: (p: Payment) => RowActionItem[], t: T) {
  return [
    col.custom<Payment>(
      t("admin.finance.payments.referenceNumber"),
      (p) => {
        const number = p.reference?.number ?? p.groupNumber ?? p.orderNumber;
        const href =
          p.sourceType === "trade" && p.reference
            ? `/operations/trades/${p.reference.id}`
            : p.anchorOrderId
              ? `/operations/orders/${p.anchorOrderId}`
              : null;
        if (!number) return <span className="text-muted">—</span>;
        return (
          <div className="flex items-center gap-2">
            {href ? (
              <Link
                href={href}
                className="font-mono text-primary-600 hover:underline"
              >
                #{number}
              </Link>
            ) : (
              <span className="font-mono">#{number}</span>
            )}
            {p.sourceType === "trade" && (
              <Badge variant="secondary" size="sm">
                {t("admin.finance.payments.tradeBadge")}
              </Badge>
            )}
          </div>
        );
      },
      {
        grow: 1,
        minWidth: 180,
        sortable: false,
        exportValue: (p) => p.reference?.number ?? "",
      },
    ),
    col.user<Payment>(
      t("admin.finance.payments.payer"),
      (p) => ({
        name: p.payer?.displayName ?? "—",
        secondary: p.payer?.email,
        href: p.payer ? `/accounts/users/${p.payer.id}` : undefined,
      }),
      { sortable: false },
    ),
    col.user<Payment>(
      t("admin.finance.payments.counterparty"),
      (p) => ({
        name:
          p.counterparty?.displayName ??
          (p.groupSellerCount > 0
            ? t("admin.finance.payments.sellerCount", {
                count: p.groupSellerCount,
              })
            : "—"),
        secondary: p.counterparty?.email,
        href: p.counterparty
          ? `/accounts/users/${p.counterparty.id}`
          : undefined,
      }),
      { sortable: false },
    ),
    col.product<Payment>(
      t("admin.finance.payments.itemSummary"),
      (p) => {
        if (p.trade) {
          const left = p.trade.initiatorItems;
          const right = p.trade.receiverItems;
          const title =
            left.length === 1 && right.length === 1
              ? `${left[0].title} ↔ ${right[0].title}`
              : t("admin.finance.payments.tradeItemCount", {
                  initiatorCount: left.length,
                  receiverCount: right.length,
                });
          return { title, href: `/operations/trades/${p.trade.id}` };
        }
        if (p.product) {
          return {
            title: p.product.title,
            href: `/catalog/products/${p.product.id}`,
          };
        }
        return {
          title:
            p.orderCount > 0
              ? t("admin.operations.orders.cartItems", {
                  count: p.orderCount,
                })
              : "—",
        };
      },
      { sortable: false },
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
