"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@tarodan/ui";
import type { AnalyticsLeaderRow } from "@tarodan/types";
import { fmtNumber, fmtTry } from "@/lib/format";

/**
 * A leaderboard ranked by REAL sales.
 *
 * The old widgets ranked by `viewCount` / `storeViewCount`: all-time counters
 * with no period at all, and no demonstrated relationship to revenue. "En çok
 * görüntülenen" was quietly being read as "en çok satan".
 */
export function LeaderTable({ rows }: { rows: AnalyticsLeaderRow[] }) {
  const t = useTranslations();

  if (rows.length === 0) {
    return <EmptyState title={t("admin.analytics.empty")} />;
  }

  return (
    <ol className="flex flex-col divide-y divide-default">
      {rows.map((row, index) => (
        <li
          key={row.id || index}
          className="flex items-center gap-3 py-2 text-sm"
        >
          <span className="w-6 shrink-0 text-center text-xs text-subtle tabular-nums">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate" title={row.label}>
            {row.label || t("admin.analytics.uncategorized")}
          </span>
          <span className="shrink-0 text-xs text-muted tabular-nums">
            {fmtNumber(row.orderCount) ?? "0"}{" "}
            {t("admin.analytics.table.orders")}
          </span>
          <span className="shrink-0 font-semibold text-heading tabular-nums">
            {fmtTry(row.gmv) ?? "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}
