import { Badge } from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import { type Payment, paymentStatusConfig } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function paymentColumns(rowMenu: (p: Payment) => RowActionItem[], t: T) {
  return [
    // Sepet ödemesinde kimlik grup numarasıdır; link anchor sipariş üzerinden
    // grup dosyasına çözülür. Hedefsiz satır (trade vb.) link üretmez (#null yok).
    col.link<Payment>(
      t("admin.finance.common.orderNumber"),
      (p) => {
        const label = p.groupNumber ?? p.orderNumber;
        const target = p.anchorOrderId;
        return {
          href: target ? `/operations/orders/${target}` : "",
          label: label ? `#${label}` : "—",
        };
      },
      { grow: 1, minWidth: 130, sortKey: "orderNumber" },
    ),
    col.user<Payment>(
      t("admin.finance.common.buyer"),
      (p) => ({
        name: p.buyer?.displayName ?? "—",
        secondary: p.buyer?.email,
        href: p.buyer ? `/accounts/users/${p.buyer.id}` : undefined,
      }),
      { sortKey: "buyer.displayName" },
    ),
    // Sepet ödemesi birden çok satıcıyı kapsayabilir → satıcı yerine sepet
    // özeti; ürün hücresi grupta "N ürünlük sepet" gösterir.
    col.user<Payment>(
      t("admin.finance.common.seller"),
      (p) => ({
        name: p.seller?.displayName ?? "—",
        secondary: p.seller?.email,
        href: p.seller ? `/accounts/users/${p.seller.id}` : undefined,
      }),
      { sortKey: "seller.displayName" },
    ),
    col.product<Payment>(
      t("admin.catalog.common.product"),
      (p) =>
        p.product
          ? {
              title: p.product.title,
              href: `/catalog/products/${p.product.id}`,
            }
          : {
              title:
                p.orderCount > 0
                  ? t("admin.operations.orders.cartItems", {
                      count: p.orderCount,
                    })
                  : "—",
            },
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
