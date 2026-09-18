"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@tarodan/ui";
import type { AnalyticsFunnelStep } from "@tarodan/types";
import { fmtNumber } from "@/lib/format";
import { formatShare, stepLabel } from "../_lib/labels";

/**
 * A funnel with its drop-off.
 *
 * Steps are counted from their OWN event stamps, so a step can exceed the one
 * before it (a listing created in March and sold in April is a sale this
 * window with no creation in it). That is why the loss is reported as a
 * separate column instead of being implied by the bar widths.
 */
export function FunnelTable({ steps }: { steps: AnalyticsFunnelStep[] }) {
  const t = useTranslations();

  if (steps.length === 0) {
    return <EmptyState title={t("admin.analytics.empty")} />;
  }

  const first = steps[0]?.count ?? 0;

  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step) => (
        <li key={step.key} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-heading">
              {stepLabel(t, step.key)}
            </span>
            <span className="tabular-nums text-heading">
              {fmtNumber(step.count) ?? "0"}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-alt">
            <div
              className="h-2 rounded-full bg-primary-500"
              style={{
                width: `${first === 0 ? 0 : Math.min(100, (step.count / first) * 100)}%`,
              }}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>
              {t("admin.analytics.table.conversion")}:{" "}
              <span className="tabular-nums">
                {formatShare(t, step.conversionFromFirst)}
              </span>
            </span>
            <span>
              {t("admin.analytics.table.dropOff")}:{" "}
              <span className="tabular-nums">
                {formatShare(t, step.dropOffFromPrevious)}
              </span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
