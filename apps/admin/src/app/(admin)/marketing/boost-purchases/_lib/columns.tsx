import { CellLink, COL_SIZE, col, TableBadge } from "@/components/table";
import {
  type BoostPurchase,
  purchaseSourceConfig,
  purchaseStatusConfig,
} from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function purchaseColumns(t: T) {
  const statusConfig = purchaseStatusConfig(t);
  const sourceConfig = purchaseSourceConfig(t);
  return [
    col.user<BoostPurchase>(
      t("admin.marketing.boostPurchases.buyer"),
      (p) =>
        p.buyer
          ? {
              name: p.buyer.name,
              secondary: p.buyer.email,
              avatar: p.buyer.avatarUrl,
              href: `/accounts/users/${p.buyer.id}`,
            }
          : null,
      { sortable: false },
    ),
    col.product<BoostPurchase>(
      t("admin.marketing.boostPurchases.product"),
      (p) =>
        p.product
          ? {
              title: p.product.title,
              href: `/catalog/products/${p.product.id}`,
            }
          : null,
      { sortable: false },
    ),
    col.custom<BoostPurchase>(
      t("admin.marketing.boostPurchases.package"),
      (p) => (
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <CellLink
            href={`/marketing/boost-purchases/${p.id}`}
            label={p.packageName ?? "—"}
          />
          {p.showcaseOnHome && (
            <TableBadge variant="outline">
              {t("admin.marketing.boostPurchases.showcaseBadge")}
            </TableBadge>
          )}
        </div>
      ),
    ),
    col.text<BoostPurchase>(
      t("admin.marketing.boostPurchases.duration"),
      (p) =>
        t("admin.marketing.boostPurchases.daysValue", { days: p.durationDays }),
      COL_SIZE.count,
    ),
    col.status<BoostPurchase>(
      t("admin.marketing.boostPurchases.sourceLabel"),
      (p) => ({ status: p.source, config: sourceConfig }),
    ),
    col.money<BoostPurchase>(
      t("admin.marketing.boostPurchases.price"),
      (p) => p.price,
      COL_SIZE.amount,
    ),
    col.money<BoostPurchase>(
      t("admin.marketing.boostPurchases.detail.refundedAmount"),
      (p) => (p.refundedAmount > 0 ? p.refundedAmount : null),
      { ...COL_SIZE.amount, sortable: false, tone: "negative" },
    ),
    col.status<BoostPurchase>(t("common.status"), (p) => ({
      status: p.status,
      config: statusConfig,
    })),
    col.date<BoostPurchase>(
      t("admin.marketing.boostPurchases.purchasedAt"),
      (p) => p.purchasedAt ?? p.createdAt,
      COL_SIZE.date,
    ),
    col.dateRange<BoostPurchase>(
      t("admin.marketing.boostPurchases.period"),
      (p) => ({ start: p.startsAt, end: p.endsAt }),
    ),
    col.text<BoostPurchase>(
      t("admin.marketing.boostPurchases.performance"),
      (p) =>
        p.metrics.gain
          ? `+${p.metrics.gain.views} / +${p.metrics.gain.likes} / +${p.metrics.gain.clicks}`
          : null,
    ),
  ];
}
