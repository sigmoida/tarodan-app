/** @format */

"use client";

import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { TextLink } from "@/components/TextLink";
import { SectionCard } from "@/components/detail/SectionCard";
import { col } from "@/components/table/columns";
import { fmtDate, fmtTry } from "@/lib/format";
import type {
  ComparisonRow,
  ComparisonSection as Comparison,
} from "../_lib/types";

/**
 * PayTR ile karşılaştırma: bizim kayıtlar ↔ senkronlanan PayTR dökümü/hakedişi.
 * "Bizim" taraf dökümün kapsadığı ilk günden itibaren sayılır; senkron kapalıyken
 * rozetle gösterilir, gizlenmez (karar).
 */
export function ComparisonSectionView({
  comparison,
}: {
  comparison: Comparison;
}) {
  const t = useTranslations();
  const base = "admin.finance.overview.comparison";

  const columns = useMemo(
    () => [
      col.custom(
        "",
        (row: ComparisonRow) => (
          <span className="text-body">
            {t(`${base}.rows.${row.key}`)}
            {row.key === "payouts" &&
              row.count !== undefined &&
              row.count > 0 && (
                <span className="ml-1 text-xs text-subtle">
                  {t(`${base}.awaiting`, { count: row.count })}
                </span>
              )}
          </span>
        ),
        { id: "label" },
      ),
      col.custom(t(`${base}.ours`), (row: ComparisonRow) => (
        <span className="tabular-nums">{fmtTry(row.ours)}</span>
      )),
      col.custom("PayTR", (row: ComparisonRow) => (
        <span className="tabular-nums">{fmtTry(row.theirs)}</span>
      )),
      col.custom(t(`${base}.diff`), (row: ComparisonRow) => (
        <span
          className={`tabular-nums ${
            row.informational && !row.balanced
              ? "text-muted"
              : row.balanced
                ? "text-success-700"
                : "font-semibold text-danger-600"
          }`}
          title={row.informational ? t(`${base}.informationalHint`) : undefined}
        >
          <span className="inline-flex items-center gap-1">
            {row.balanced ? (
              <CheckCircleIcon className="h-4 w-4" />
            ) : row.informational ? null : (
              <ExclamationTriangleIcon className="h-4 w-4" />
            )}
            {row.difference < 0 ? "−" : ""}
            {fmtTry(Math.abs(row.difference))}
          </span>
        </span>
      )),
    ],
    [t],
  );

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          {t(`${base}.title`)}
          <TextLink href="/finance/psp" className="text-sm font-normal">
            {t(`${base}.open`)}
          </TextLink>
        </span>
      }
      actions={
        !comparison.syncEnabled ? (
          <Badge
            variant="warning"
            title={t("admin.finance.overview.syncOffHint")}
          >
            {t("admin.finance.overview.syncOff")}
          </Badge>
        ) : comparison.coverageFrom ? (
          <span className="text-xs text-muted">
            {t(`${base}.coverageFrom`, {
              date: fmtDate(comparison.coverageFrom) ?? "",
            })}
          </span>
        ) : undefined
      }
    >
      <DataTable
        columns={columns}
        data={comparison.rows}
        dense
        getRowId={(row) => row.key}
      />
    </SectionCard>
  );
}
