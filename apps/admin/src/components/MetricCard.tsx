"use client";

import { type ComponentType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/outline";
import { cn, Skeleton } from "@tarodan/ui";

export type MetricTone = "primary" | "info" | "success" | "warning" | "danger";

/** Static tone → soft icon box + colored icon (Tailwind can't build class names at runtime). */
const TONES: Record<MetricTone, { box: string; icon: string }> = {
  primary: { box: "bg-primary-500/10", icon: "text-primary-500" },
  info: { box: "bg-info-500/10", icon: "text-info-500" },
  success: { box: "bg-success-500/10", icon: "text-success-500" },
  warning: { box: "bg-warning-500/10", icon: "text-warning-500" },
  danger: { box: "bg-danger-500/10", icon: "text-danger-500" },
};

/**
 * The shared metric card — a soft-tinted icon box next to a label + value.
 * The single source of truth for summary metrics across admin pages
 * (analytics, seller performance, dashboard, …). The trend row (`change`) and
 * footer (`footer`) are optional, for pages that surface more per-card data.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
  title,
  change,
  changeLabel,
  footer,
  className,
  loading = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  tone?: MetricTone;
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
  const t = TONES[tone];
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
          hover) rather than wrapping, so every card's icon+value row lines up. */}
      <p
        className="mb-3 truncate text-sm text-muted"
        title={typeof label === "string" ? label : undefined}
      >
        {label}
      </p>
      {/* Icon and value share one centered row → they're always vertically aligned. */}
      <div className="flex items-center gap-4">
        <div className={cn("shrink-0 rounded-lg p-3", t.box)}>
          <Icon className={cn("h-6 w-6", t.icon)} />
        </div>
        <p
          className="min-w-0 truncate text-xl font-bold text-heading"
          title={title}
        >
          {loading ? <Skeleton className="h-7 w-20" /> : value}
        </p>
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
