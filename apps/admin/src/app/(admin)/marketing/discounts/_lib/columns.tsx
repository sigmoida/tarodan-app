import {
  CellMuted,
  CellText,
  COL_SIZE,
  col,
  TableBadge,
  type RowActionItem,
} from "@/components/table";
import { fmtTry } from "@/lib/format";
import {
  type Discount,
  scopeLabels,
  discountStatusConfig,
  getDiscountStatus,
  audienceLabel,
  discountValueLabel,
  targetLabel,
} from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Renkli rozet yalnız DURUM taşır (durum, flaş indirim, bütçe doldu); kapsam ve
 * hedef düz metindir (alt satırda kategori / kitle). Uzun metin kırpılır, tam
 * hâli ipucunda.
 */
export function discountColumns(
  rowMenu: (d: Discount) => RowActionItem[],
  t: T,
) {
  const scopes = scopeLabels(t);
  const statuses = discountStatusConfig(t);
  return [
    col.title<Discount>(
      t("admin.marketing.discounts.discount"),
      (d) => ({ title: d.name, secondary: d.description }),
      { sortKey: "name", sortType: "text" },
    ),
    col.custom<Discount>(
      t("admin.marketing.discounts.code"),
      (d) => (
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          {d.code ? (
            <CellText value={d.code} />
          ) : (
            <CellMuted value={t("admin.marketing.discounts.automatic")} />
          )}
          {d.isFlashSale && (
            <TableBadge variant="outline">
              {t("admin.marketing.discounts.flashBadge")}
            </TableBadge>
          )}
        </div>
      ),
      { sortKey: "code", sortType: "text" },
    ),
    col.text<Discount>(
      t("admin.marketing.discounts.value"),
      (d) => discountValueLabel(d, t),
      { ...COL_SIZE.label, sortKey: "value", sortType: "number" },
    ),
    col.stacked<Discount>(
      t("admin.marketing.discounts.scopeLabel"),
      (d) => ({ value: scopes[d.scope] ?? d.scope, secondary: d.categoryName }),
      { ...COL_SIZE.label, sortKey: "scope", sortType: "text" },
    ),
    // Hangi kalemi indiriyor + kime: kampanyanın anlamı bu iki alanda.
    col.stacked<Discount>(
      t("admin.marketing.discounts.targetLabel"),
      (d) => ({
        value: targetLabel(t, d.target),
        secondary: audienceLabel(t, d.audience),
      }),
      { sortKey: "target", sortType: "text" },
    ),
    // Bütçe, bedel kampanyasının maliyet kontrolüdür: dolduğunda kampanya durur.
    col.stacked<Discount>(
      t("admin.marketing.discounts.budgetUsage"),
      (d) =>
        d.budgetLimit == null
          ? null
          : {
              value: `${fmtTry(d.budgetSpent) ?? "—"} / ${fmtTry(d.budgetLimit) ?? "—"}`,
              secondary: d.budgetStoppedAt ? (
                <TableBadge variant="danger">
                  {t("admin.marketing.discounts.budgetStopped")}
                </TableBadge>
              ) : null,
            },
      { ...COL_SIZE.amountRange, sortKey: "budgetSpent", sortType: "number" },
    ),
    col.text<Discount>(
      t("admin.marketing.discounts.usage"),
      (d) =>
        d.usageLimitTotal
          ? `${d.usedCount} / ${d.usageLimitTotal}`
          : `${d.usedCount}`,
      { ...COL_SIZE.count, sortKey: "usedCount", sortType: "number" },
    ),
    col.dateRange<Discount>(
      t("common.date"),
      (d) => ({ start: d.startDate, end: d.endDate }),
      { sortKey: "startDate" },
    ),
    col.status<Discount>(
      t("common.status"),
      (d) => ({ status: getDiscountStatus(d), config: statuses }),
      { sortKey: "isActive", sortType: "number" },
    ),
    col.rowMenu<Discount>(rowMenu),
  ];
}
