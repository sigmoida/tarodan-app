import type { AdminInstallmentPreviewRow } from "@tarodan/types";
import { col } from "@/components/table";
import { fmtPercent, fmtTry } from "@/lib/format";
import { STATUS_TONE } from "@/lib/status-tone";
import type { Translate } from "@/lib/statusLabels";

const L = "admin.finance.installments.preview.columns";
const NOT_SORTABLE = { sortable: false } as const;

/** A share as typed: whole percents plain, others with two decimals. */
export const fmtShare = (share: number) =>
  fmtPercent(share, Number.isInteger(share) ? 0 : 2);

/**
 * The preview table: per count whether it is offered and, if so, the
 * monthly amount, the charged total (C), the installment fee (F), the
 * platform share and the platform cost (P), and the rule that decided it.
 */
export const previewColumns = (
  t: Translate,
  ruleLabel: (ruleId: string | null) => string,
) => [
  col.number<AdminInstallmentPreviewRow>(
    t(`${L}.count`),
    (row) => row.count,
    NOT_SORTABLE,
  ),
  col.status<AdminInstallmentPreviewRow>(
    t(`${L}.offered`),
    (row) =>
      row.offered
        ? {
            variant: STATUS_TONE.live,
            children: t("admin.finance.installments.preview.offered"),
          }
        : {
            variant: STATUS_TONE.inactive,
            children: t("admin.finance.installments.preview.notOffered"),
          },
    NOT_SORTABLE,
  ),
  col.text<AdminInstallmentPreviewRow>(
    t(`${L}.monthly`),
    (row) =>
      row.monthlyAmount === null
        ? null
        : t("admin.finance.installments.preview.monthlyValue", {
            count: row.count,
            amount: fmtTry(row.monthlyAmount) ?? "",
          }),
    NOT_SORTABLE,
  ),
  col.money<AdminInstallmentPreviewRow>(
    t(`${L}.total`),
    (row) => row.totalAmount,
    NOT_SORTABLE,
  ),
  col.money<AdminInstallmentPreviewRow>(
    t(`${L}.fee`),
    (row) => row.feeAmount,
    NOT_SORTABLE,
  ),
  col.text<AdminInstallmentPreviewRow>(
    t(`${L}.share`),
    (row) => fmtShare(row.platformSharePct),
    NOT_SORTABLE,
  ),
  col.money<AdminInstallmentPreviewRow>(
    t(`${L}.platformCost`),
    (row) => row.platformCostAmount,
    { ...NOT_SORTABLE, tone: "negative" },
  ),
  col.text<AdminInstallmentPreviewRow>(
    t(`${L}.rule`),
    (row) => ruleLabel(row.ruleId),
    NOT_SORTABLE,
  ),
];
