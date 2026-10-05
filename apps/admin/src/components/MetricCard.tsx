"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/outline";
import { cn, Skeleton } from "@tarodan/ui";

/**
 * The shared metric card — a label over its value. No icon: the label says
 * what the number is, and a decorative icon per card carried no information.
 * The single source of truth for summary metrics across admin pages
 * (analytics, seller performance, dashboard, …). The trend row (`change`) and
 * footer (`footer`) are optional, for pages that surface more per-card data.
 */
export function MetricCard({
  label,
  value,
  title,
  change,
  changeLabel,
  footer,
  className,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  /** Tooltip for the (truncated) value — e.g. a long name. */
  title?: string;
  /** Signed percentage delta — renders a colored up/down trend row when set. */
  change?: number;
  /** Suffix next to the trend value (default "vs yesterday"). */
  changeLabel?: string;
  /** Extra content rendered under the value/trend (e.g. a secondary stat). */
  footer?: ReactNode;
  className?: string;
  /** Replaces async values with fixed-size skeletons until data is available. */
  loading?: boolean;
}) {
  const translate = useTranslations();
  const resolvedChangeLabel =
    changeLabel ?? translate("admin.shared.metricCard.vsYesterday");
  const up = (change ?? 0) >= 0;
  const hasBottom = change !== undefined || footer != null;
  return (
    <div
      aria-busy={loading || undefined}
      className={cn(
        "rounded-lg border border-border bg-surface-elevated p-4 shadow-sm",
        className,
      )}
    >
      {/* Single line — truncate with "…" when it doesn't fit (full text on
          hover) rather than wrapping, so every card's value lines up. */}
      <p
        className="mb-2 truncate text-sm text-muted"
        title={typeof label === "string" ? label : undefined}
      >
        {label}
      </p>
      <div
        className="min-w-0 truncate text-2xl font-bold text-heading"
        title={title}
      >
        {loading ? <Skeleton className="h-8 w-20" /> : value}
      </div>
      {hasBottom && (
        <div className="mt-3 flex flex-wrap items-center justify-start gap-1 border-t border-border pt-3 text-sm">
          {loading ? (
            <Skeleton className="h-5 w-28" />
          ) : change !== undefined ? (
            <>
              {up ? (
                <ArrowTrendingUpIcon className="h-4 w-4 shrink-0 text-success-700" />
              ) : (
                <ArrowTrendingDownIcon className="h-4 w-4 shrink-0 text-danger-600" />
              )}
              <span className={up ? "text-success-700" : "text-danger-600"}>
                {Math.abs(change)}%
              </span>
              <span className="whitespace-nowrap text-muted">
                {resolvedChangeLabel}
              </span>
            </>
          ) : null}
          {!loading && footer}
        </div>
      )}
    </div>
  );
}
