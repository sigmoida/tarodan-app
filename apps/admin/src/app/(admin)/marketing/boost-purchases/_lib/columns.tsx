import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { type BoostPurchase, purchaseStatusConfig } from "./types";
import type { useTranslations } from "next-intl";
import Link from "next/link";

type T = ReturnType<typeof useTranslations<never>>;

export function purchaseColumns(t: T) {
  const statusConfig = purchaseStatusConfig(t);
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
      { minWidth: 280, sortable: false },
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
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/marketing/boost-purchases/${p.id}`}
            className="truncate font-medium text-primary hover:underline"
          >
            {p.packageName ?? "—"}
          </Link>
          {p.showcaseOnHome && (
            <Badge variant="primary" size="sm">
              {t("admin.marketing.boostPurchases.showcaseBadge")}
            </Badge>
          )}
        </div>
      ),
      { grow: 2, minWidth: 150 },
    ),
    col.muted<BoostPurchase>(
      t("admin.marketing.boostPurchases.duration"),
      (p) =>
        t("admin.marketing.boostPurchases.daysValue", { days: p.durationDays }),
      { minWidth: 90 },
    ),
    col.money<BoostPurchase>(
      t("admin.marketing.boostPurchases.price"),
      (p) => p.price,
    ),
    col.badge<BoostPurchase>(t("common.status"), (p) => (
      <Badge status={p.status} config={statusConfig} />
    )),
    col.date<BoostPurchase>(
      t("admin.marketing.boostPurchases.purchasedAt"),
      (p) => p.purchasedAt ?? p.createdAt,
    ),
    col.custom<BoostPurchase>(
      t("admin.marketing.boostPurchases.period"),
      (p) => <PeriodCell startsAt={p.startsAt} endsAt={p.endsAt} />,
      { grow: 2, minWidth: 220 },
    ),
    col.custom<BoostPurchase>(
      t("admin.marketing.boostPurchases.performance"),
      (p) =>
        p.metrics.gain ? (
          <span className="whitespace-nowrap text-sm font-medium text-success">
            +{p.metrics.gain.views} / +{p.metrics.gain.likes} / +
            {p.metrics.gain.clicks}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
      { minWidth: 220 },
    ),
  ];
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function PeriodCell({
  startsAt,
  endsAt,
}: {
  startsAt: string | null;
  endsAt: string | null;
}) {
  if (!startsAt && !endsAt) return <span className="text-subtle">—</span>;
  return (
    <span className="whitespace-nowrap text-sm text-muted">
      {fmt(startsAt)} – {fmt(endsAt)}
    </span>
  );
}
