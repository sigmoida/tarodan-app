/** @format */

import type { ComponentType, SVGProps } from "react";
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import MiniChart from "./MiniChart";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface AnalyticsStatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: Icon;
  accent?: string;
  chartData?: number[];
  chartColor?: string;
  subtitle?: string;
}

/** Headline analytics stat: icon + value + period-over-period change + sparkline. */
export default function AnalyticsStatCard({
  title,
  value,
  change,
  icon: Icon,
  accent = "text-primary-600",
  chartData,
  chartColor,
  subtitle,
}: AnalyticsStatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-6">
      <div className="mb-4 flex items-start justify-between">
        <div className="rounded-xl bg-surface p-3">
          <Icon className={`h-6 w-6 ${accent}`} />
        </div>
        {change !== undefined && (
          <Badge
            variant={change >= 0 ? "success" : "danger"}
            size="sm"
            icon={
              change >= 0 ? (
                <ArrowTrendingUpIcon className="h-4 w-4" />
              ) : (
                <ArrowTrendingDownIcon className="h-4 w-4" />
              )
            }
          >
            {Math.abs(change).toFixed(1)}%
          </Badge>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold text-heading">{value}</p>
          <p className="mt-1 text-sm text-muted">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-subtle">{subtitle}</p>}
        </div>
        {chartData && chartColor && (
          <MiniChart data={chartData} color={chartColor} />
        )}
      </div>
    </div>
  );
}
