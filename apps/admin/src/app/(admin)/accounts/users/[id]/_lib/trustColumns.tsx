import { type ColumnDef } from "@/components/DataTable";
import { COL_WIDTH, col } from "@/components/table";
import type { Translate } from "@/lib/statusLabels";
import type { TrustBreakdownRow, TrustExplainRow } from "./trustBreakdown";

const NOT_SORTABLE = { sortable: false } as const;

const componentColumn = <R extends TrustBreakdownRow>(t: Translate) =>
  col.text<R>(
    t("admin.users.detail.trust.colComponent"),
    (r) => r.component,
    NOT_SORTABLE,
  );

const weightColumn = <R extends TrustBreakdownRow>(t: Translate) =>
  col.text<R>(t("admin.users.detail.trust.colWeight"), (r) => r.weight, {
    ...NOT_SORTABLE,
    grow: 1,
    minWidth: COL_WIDTH.count,
  });

const subScoreColumn = <R extends TrustBreakdownRow>(t: Translate) =>
  col.text<R>(t("admin.users.detail.trust.colSubScore"), (r) => r.subScore, {
    ...NOT_SORTABLE,
    grow: 1,
    minWidth: COL_WIDTH.count,
  });

// One count per line, so each stays readable without wrapping.
const detailColumn = <R extends TrustBreakdownRow>(
  t: Translate,
  header = t("admin.users.detail.trust.colDetail"),
) =>
  col.stacked<R>(header, (r) => r.detail, {
    ...NOT_SORTABLE,
    grow: 6,
    minWidth: COL_WIDTH.description,
  });

/** The trust score breakdown: component, weight, sub-score, counts. */
export function trustBreakdownColumns(
  t: Translate,
): ColumnDef<TrustBreakdownRow, unknown>[] {
  return [
    componentColumn(t),
    weightColumn(t),
    subScoreColumn(t),
    detailColumn(t),
  ];
}

/**
 * The lab's explain table: the breakdown columns, in working order (inputs,
 * rate, sub-score, weight), then the contribution to the score.
 */
export function trustExplainColumns(
  t: Translate,
): ColumnDef<TrustExplainRow, unknown>[] {
  return [
    componentColumn<TrustExplainRow>(t),
    detailColumn<TrustExplainRow>(
      t,
      t("admin.system.sellerTrustLab.seller.colInputs"),
    ),
    col.text<TrustExplainRow>(
      t("admin.system.sellerTrustLab.seller.colRate"),
      (r) => r.rate,
      { ...NOT_SORTABLE, grow: 1, minWidth: COL_WIDTH.count },
    ),
    subScoreColumn<TrustExplainRow>(t),
    weightColumn<TrustExplainRow>(t),
    col.text<TrustExplainRow>(
      t("admin.system.sellerTrustLab.seller.colContribution"),
      (r) => r.contribution,
      { ...NOT_SORTABLE, grow: 1, minWidth: COL_WIDTH.count },
    ),
  ];
}
