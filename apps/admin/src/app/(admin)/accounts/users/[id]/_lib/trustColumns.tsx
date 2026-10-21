import { type ColumnDef } from "@/components/DataTable";
import { col } from "@/components/table";
import type { Translate } from "@/lib/statusLabels";
import type { TrustBreakdownRow } from "./trustBreakdown";

const NOT_SORTABLE = { sortable: false } as const;

/** The trust score breakdown: component, weight, sub-score, counts. */
export function trustBreakdownColumns(
  t: Translate,
): ColumnDef<TrustBreakdownRow, unknown>[] {
  return [
    col.text<TrustBreakdownRow>(
      t("admin.users.detail.trust.colComponent"),
      (r) => r.component,
      NOT_SORTABLE,
    ),
    col.text<TrustBreakdownRow>(
      t("admin.users.detail.trust.colWeight"),
      (r) => r.weight,
      { ...NOT_SORTABLE, grow: 1, minWidth: 100 },
    ),
    col.text<TrustBreakdownRow>(
      t("admin.users.detail.trust.colSubScore"),
      (r) => r.subScore,
      { ...NOT_SORTABLE, grow: 1, minWidth: 100 },
    ),
    col.text<TrustBreakdownRow>(
      t("admin.users.detail.trust.colDetail"),
      (r) => r.detail,
      { ...NOT_SORTABLE, grow: 6, minWidth: 360 },
    ),
  ];
}
