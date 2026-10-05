"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@tarodan/ui";
import type {
  AnalyticsBoostPackageRow,
  AnalyticsBreakdownRow,
} from "@tarodan/types";
import { DataTable } from "@/components/DataTable";
import { ProgressBar } from "@/components/ProgressBar";
import { col } from "@/components/table";
import { fmtNumber } from "@/lib/format";
import { formatShare, rowLabel } from "../_lib/labels";
import type { BreakdownConfig } from "../_lib/tabConfig";

/**
 * A breakdown — the same table for every one of them, because they are the
 * same shape. The API returns a stable key plus either a database name or a
 * schema value; only the SCREEN decides what a `not_as_described` reads like.
 * The share column carries a bar — the ranking is readable without doing maths.
 */
export function BreakdownTable({
  config,
  rows,
}: {
  config: BreakdownConfig;
  rows: AnalyticsBreakdownRow[];
}) {
  const t = useTranslations();

  const columns = useMemo(
    () => [
      col.text<AnalyticsBreakdownRow>(t("admin.analytics.table.label"), (row) =>
        rowLabel(t, config.labels, row),
      ),
      col.number<AnalyticsBreakdownRow>(
        t("admin.analytics.table.count"),
        (row) => row.count,
        { align: "right" },
      ),
      col.money<AnalyticsBreakdownRow>(
        t("admin.analytics.table.amount"),
        (row) => row.amount,
        { align: "right" },
      ),
      col.custom<AnalyticsBreakdownRow>(
        t("admin.analytics.table.share"),
        (row) => (
          <div className="flex items-center justify-end gap-2">
            <ProgressBar value={row.share} className="flex-1" />
            <span className="w-14 text-right tabular-nums">
              {formatShare(t, row.share)}
            </span>
          </div>
        ),
        { align: "right", minWidth: 200 },
      ),
    ],
    [t, config],
  );

  if (rows.length === 0) {
    return <EmptyState title={t("admin.analytics.empty")} />;
  }

  return (
    <DataTable
      dense
      columns={columns}
      data={rows}
      getRowId={(row) => row.key || row.label}
    />
  );
}

/**
 * Boost packages carry one column the other breakdowns do not: what the boost
 * actually bought. A package whose boosts have not finished measuring reports
 * NULL, not zero — "no uplift" and "not measured yet" are different answers.
 */
export function BoostPackageTable({
  rows,
}: {
  rows: AnalyticsBoostPackageRow[];
}) {
  const t = useTranslations();

  const columns = useMemo(
    () => [
      col.text<AnalyticsBoostPackageRow>(
        t("admin.analytics.table.label"),
        (row) =>
          row.label || row.key || t("admin.analytics.uncategorized"),
      ),
      col.number<AnalyticsBoostPackageRow>(
        t("admin.analytics.table.count"),
        (row) => row.count,
        { align: "right" },
      ),
      col.money<AnalyticsBoostPackageRow>(
        t("admin.analytics.table.amount"),
        (row) => row.amount,
        { align: "right" },
      ),
      col.custom<AnalyticsBoostPackageRow>(
        t("admin.analytics.table.uplift"),
        (row) => (
          <span className="tabular-nums">
            {row.averageViewUplift === null
              ? t("admin.analytics.table.notMeasured")
              : (fmtNumber(row.averageViewUplift) ?? "0")}
          </span>
        ),
        { align: "right" },
      ),
    ],
    [t],
  );

  if (rows.length === 0) {
    return <EmptyState title={t("admin.analytics.empty")} />;
  }

  return (
    <DataTable
      dense
      columns={columns}
      data={rows}
      getRowId={(row) => row.key || row.label}
    />
  );
}
