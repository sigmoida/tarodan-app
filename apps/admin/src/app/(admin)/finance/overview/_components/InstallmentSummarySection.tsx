/** @format */

"use client";

import type { MessageKey } from "@tarodan/i18n";
import { Badge, TableCell, TableRow } from "@tarodan/ui";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { CellMoney, CellNumber, col } from "@/components/table";
import { installmentSegmentLabel } from "@/app/(admin)/finance/installments/_lib/segments";
import { installmentCountLabel } from "@/lib/payment-installment";
import type { Translate } from "@/lib/statusLabels";
import type {
  InstallmentSummary,
  InstallmentSummaryRow,
  InstallmentSummaryTotals,
} from "../_lib/types";

const L = "admin.finance.overview.installments";

/**
 * The money columns in table order, with their header; the totals row reads
 * the same list. Headers reuse the S3 line and the payment detail label of
 * the same figure.
 */
const MONEY_COLUMNS = [
  ["feeCollected", `${L}.columns.feeCollected`],
  ["feeRefunded", `${L}.columns.feeRefunded`],
  [
    "feeIncomeNet",
    "admin.finance.overview.sections.platformNet.lines.installmentFeeIncome",
  ],
  ["platformCostExpected", "admin.finance.payments.installment.platformCost"],
  ["platformCostBooked", `${L}.columns.platformCostBooked`],
] as const satisfies ReadonlyArray<
  readonly [keyof InstallmentSummaryTotals, MessageKey]
>;

const columns = (t: Translate) => [
  col.text<InstallmentSummaryRow>(
    t("admin.finance.installments.preview.columns.count"),
    (row) => installmentCountLabel(t, row.installmentCount),
    { sortable: false },
  ),
  col.text<InstallmentSummaryRow>(
    t("admin.finance.installments.rules.columns.segment"),
    (row) => installmentSegmentLabel(t, row.segment),
    { sortable: false },
  ),
  col.number<InstallmentSummaryRow>(
    t(`${L}.columns.payments`),
    (row) => row.payments,
    { sortable: false },
  ),
  ...MONEY_COLUMNS.map(([field, header]) =>
    col.money<InstallmentSummaryRow>(t(header), (row) => row[field], {
      sortable: false,
    }),
  ),
];

/**
 * The installment summary of the finance overview (ADR 0019): the vade farkı
 * the buyers paid and kept, and the installment cost the segment rules made
 * the platform absorb, by installment count × buyer segment, with a totals
 * row. S1 and S3 show the same totals as lines. All time, live lane only.
 */
export function InstallmentSummarySection({
  summary,
  syncEnabled,
}: {
  summary: InstallmentSummary;
  syncEnabled: boolean;
}) {
  const t = useTranslations();
  const cols = useMemo(() => columns(t), [t]);
  const { rows, totals } = summary;

  return (
    <SectionCard
      title={t(`${L}.title`)}
      actions={
        // The booked cost comes from PayTR's statement deductions.
        !syncEnabled ? (
          <Badge
            variant="warning"
            title={t("admin.finance.overview.syncOffHint")}
          >
            {t("admin.finance.overview.syncOff")}
          </Badge>
        ) : (
          <span className="text-xs text-muted">
            {t("admin.finance.overview.scope.allTime")}
          </span>
        )
      }
    >
      <p className="mb-3 text-sm text-muted">{t(`${L}.description`)}</p>
      <DataTable
        columns={cols}
        data={rows}
        dense
        getRowId={(row) => `${row.installmentCount}:${row.segment}`}
        emptyText={t(`${L}.empty`)}
        footer={
          rows.length > 0 ? (
            <TableRow>
              <TableCell className="py-2 font-semibold text-heading">
                {t("common.total")}
              </TableCell>
              <TableCell className="py-2" />
              <TableCell className="py-2">
                <CellNumber value={totals.payments} />
              </TableCell>
              {MONEY_COLUMNS.map(([field]) => (
                <TableCell key={field} className="py-2">
                  <CellMoney value={totals[field]} />
                </TableCell>
              ))}
            </TableRow>
          ) : undefined
        }
      />
    </SectionCard>
  );
}
