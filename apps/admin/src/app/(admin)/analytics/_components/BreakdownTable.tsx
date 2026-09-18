"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@tarodan/ui";
import type {
  AnalyticsBoostPackageRow,
  AnalyticsBreakdownRow,
} from "@tarodan/types";
import { fmtNumber, fmtTry } from "@/lib/format";
import { formatShare, rowLabel } from "../_lib/labels";
import type { BreakdownConfig } from "../_lib/tabConfig";

/** A share bar behind the row — the ranking is readable without doing maths. */
function ShareBar({ share }: { share: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-alt">
      <div
        className="h-1.5 rounded-full bg-primary-500"
        style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
      />
    </div>
  );
}

/**
 * A breakdown — the same table for every one of them, because they are the
 * same shape. The API returns a stable key plus either a database name or a
 * schema value; only the SCREEN decides what a `not_as_described` reads like.
 */
export function BreakdownTable({
  config,
  rows,
}: {
  config: BreakdownConfig;
  rows: AnalyticsBreakdownRow[];
}) {
  const t = useTranslations();

  if (rows.length === 0) {
    return <EmptyState title={t("admin.analytics.empty")} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-subtle">
            <th className="pb-2 font-medium">
              {t("admin.analytics.table.label")}
            </th>
            <th className="pb-2 text-right font-medium">
              {t("admin.analytics.table.count")}
            </th>
            <th className="pb-2 text-right font-medium">
              {t("admin.analytics.table.amount")}
            </th>
            <th className="w-32 pb-2 text-right font-medium">
              {t("admin.analytics.table.share")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key || row.label} className="border-t border-default">
              <td className="py-2 pr-3">{rowLabel(t, config.labels, row)}</td>
              <td className="py-2 text-right tabular-nums">
                {fmtNumber(row.count) ?? "0"}
              </td>
              <td className="py-2 text-right tabular-nums">
                {fmtTry(row.amount) ?? "—"}
              </td>
              <td className="py-2 pl-3">
                <div className="flex items-center justify-end gap-2">
                  <ShareBar share={row.share} />
                  <span className="w-14 text-right tabular-nums">
                    {formatShare(t, row.share)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

  if (rows.length === 0) {
    return <EmptyState title={t("admin.analytics.empty")} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-subtle">
            <th className="pb-2 font-medium">
              {t("admin.analytics.table.label")}
            </th>
            <th className="pb-2 text-right font-medium">
              {t("admin.analytics.table.count")}
            </th>
            <th className="pb-2 text-right font-medium">
              {t("admin.analytics.table.amount")}
            </th>
            <th className="pb-2 text-right font-medium">
              {t("admin.analytics.table.uplift")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key || row.label} className="border-t border-default">
              <td className="py-2 pr-3">
                {row.label || row.key || t("admin.analytics.uncategorized")}
              </td>
              <td className="py-2 text-right tabular-nums">
                {fmtNumber(row.count) ?? "0"}
              </td>
              <td className="py-2 text-right tabular-nums">
                {fmtTry(row.amount) ?? "—"}
              </td>
              <td className="py-2 text-right tabular-nums">
                {row.averageViewUplift === null
                  ? t("admin.analytics.table.notMeasured")
                  : (fmtNumber(row.averageViewUplift) ?? "0")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
