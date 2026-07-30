import { Badge } from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import { fmtDate } from "@/lib/format";
import {
  type Discount,
  scopeLabels,
  discountStatusConfig,
  getDiscountStatus,
  discountValueLabel,
} from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Rozetler bu tabloda SABİT genişlikte: içerik uzunluğu satırdan satıra değişse
 * de ("Tüm Site" / "Ürün" / "Süresi Doldu") kolon içinde hizalı bir sütun
 * oluşsun. İçerik kadar genişleyen rozetler sıralamayı tırtıklı gösteriyordu.
 */
const BADGE_SIZE = "w-28 justify-center";

export function discountColumns(
  rowMenu: (d: Discount) => RowActionItem[],
  t: T,
) {
  const scopes = scopeLabels(t);
  return [
    col.custom<Discount>(
      t("admin.marketing.discounts.discount"),
      (d) => (
        <div className="min-w-0">
          <p className="font-medium text-heading">{d.name}</p>
          {d.description && (
            <p className="mt-1 whitespace-normal break-words text-xs leading-5 text-muted">
              {d.description}
            </p>
          )}
        </div>
      ),
      { grow: 3, minWidth: 340, sortKey: "name", sortType: "text" },
    ),
    col.custom<Discount>(
      t("admin.marketing.discounts.code"),
      (d) => (
        <div className="flex items-center gap-2">
          {d.code ? (
            <code className="rounded bg-surface-alt px-2 py-1 font-mono text-sm text-heading">
              {d.code}
            </code>
          ) : (
            <span className="text-xs italic text-muted">
              {t("admin.marketing.discounts.automatic")}
            </span>
          )}
          {d.isFlashSale && (
            <Badge variant="primary" size="sm" className={BADGE_SIZE}>
              ⚡ Flash
            </Badge>
          )}
        </div>
      ),
      { grow: 1, minWidth: 230, sortKey: "code", sortType: "text" },
    ),
    col.custom<Discount>(
      t("admin.marketing.discounts.value"),
      (d) => (
        <span className="font-semibold text-primary">
          {discountValueLabel(d, t)}
        </span>
      ),
      { grow: 1, minWidth: 130, sortKey: "value", sortType: "number" },
    ),
    col.custom<Discount>(
      t("admin.marketing.discounts.scopeLabel"),
      (d) => (
        <div className="min-w-0">
          <Badge variant="info" size="sm" className={BADGE_SIZE}>
            {scopes[d.scope] ?? d.scope}
          </Badge>
          {d.categoryName && (
            <p className="mt-1 truncate text-xs text-muted">{d.categoryName}</p>
          )}
        </div>
      ),
      { grow: 1, minWidth: 150, sortKey: "scope", sortType: "text" },
    ),
    col.muted<Discount>(
      t("admin.marketing.discounts.usage"),
      (d) =>
        d.usageLimitTotal
          ? `${d.usedCount} / ${d.usageLimitTotal}`
          : `${d.usedCount}`,
      { sortKey: "usedCount", sortType: "number" },
    ),
    col.custom<Discount>(
      t("common.date"),
      (d) => (
        <span className="whitespace-nowrap text-sm text-muted">
          {fmtDate(d.startDate)} – {fmtDate(d.endDate)}
        </span>
      ),
      { minWidth: 220, sortKey: "startDate", sortType: "date" },
    ),
    col.badge<Discount>(
      t("common.status"),
      (d) => (
        <Badge
          status={getDiscountStatus(d)}
          config={discountStatusConfig(t)}
          className={BADGE_SIZE}
        />
      ),
      { sortKey: "isActive", sortType: "number" },
    ),
    col.rowMenu<Discount>(rowMenu),
  ];
}
