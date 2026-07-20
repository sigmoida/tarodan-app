import { Badge } from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import { fmtDate } from "@/lib/format";
import {
  type Discount,
  SCOPE_LABELS,
  discountStatusConfig,
  getDiscountStatus,
  discountValueLabel,
} from "./types";

export function discountColumns(rowMenu: (d: Discount) => RowActionItem[]) {
  return [
    col.custom<Discount>(
      "İndirim",
      (d) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-heading">{d.name}</p>
          {d.description && (
            <p className="truncate text-xs text-muted">{d.description}</p>
          )}
        </div>
      ),
      { grow: 3, minWidth: 200, sortKey: "name", sortType: "text" },
    ),
    col.custom<Discount>(
      "Kod",
      (d) => (
        <div className="flex items-center gap-2">
          {d.code ? (
            <code className="rounded bg-surface-alt px-2 py-1 font-mono text-sm text-heading">
              {d.code}
            </code>
          ) : (
            <span className="text-xs italic text-muted">Otomatik</span>
          )}
          {d.isFlashSale && (
            <Badge variant="primary" size="sm">
              ⚡ Flash
            </Badge>
          )}
        </div>
      ),
      { grow: 1, minWidth: 130, sortKey: "code", sortType: "text" },
    ),
    col.custom<Discount>(
      "Değer",
      (d) => (
        <span className="font-semibold text-primary">
          {discountValueLabel(d)}
        </span>
      ),
      { grow: 1, minWidth: 130, sortKey: "value", sortType: "number" },
    ),
    col.custom<Discount>(
      "Kapsam",
      (d) => (
        <div className="min-w-0">
          <Badge variant="info" size="sm">
            {SCOPE_LABELS[d.scope] ?? d.scope}
          </Badge>
          {d.categoryName && (
            <p className="mt-1 truncate text-xs text-muted">{d.categoryName}</p>
          )}
        </div>
      ),
      { grow: 1, minWidth: 110, sortKey: "scope", sortType: "text" },
    ),
    col.muted<Discount>(
      "Kullanım",
      (d) =>
        d.usageLimitTotal
          ? `${d.usedCount} / ${d.usageLimitTotal}`
          : `${d.usedCount}`,
      { sortKey: "usedCount", sortType: "number" },
    ),
    col.muted<Discount>(
      "Tarih",
      (d) => `${fmtDate(d.startDate)} – ${fmtDate(d.endDate)}`,
      { sortKey: "startDate", sortType: "date" },
    ),
    col.badge<Discount>(
      "Durum",
      (d) => (
        <Badge status={getDiscountStatus(d)} config={discountStatusConfig} />
      ),
      { sortKey: "isActive", sortType: "number" },
    ),
    col.rowMenu<Discount>(rowMenu),
  ];
}
