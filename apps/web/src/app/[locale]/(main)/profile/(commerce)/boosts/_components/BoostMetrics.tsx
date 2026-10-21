/** @format */

"use client";

import { useTranslations } from "next-intl";
import { CursorArrowRaysIcon, EyeIcon } from "@heroicons/react/24/outline";
import { HeartIcon } from "@heroicons/react/24/solid";
import type { BoostMetricCounts } from "@tarodan/types";
import { formatCount } from "@/lib/format";

/**
 * The listing's views, favourites and clicks gained since the boost started.
 * A counter that went down (an unfavourite) shows no gain, not a negative one.
 */
export default function BoostMetrics({
  gain,
}: {
  gain: BoostMetricCounts | null;
}) {
  const t = useTranslations();
  if (!gain) {
    return (
      <p className="text-xs text-muted">
        {t("profile.boosts.performance.pending")}
      </p>
    );
  }
  const cells = [
    {
      key: "views",
      icon: <EyeIcon className="h-4 w-4 text-primary-500" />,
      value: Math.max(0, gain.views),
      label: t("profile.boosts.performance.views"),
    },
    {
      key: "likes",
      icon: <HeartIcon className="h-4 w-4 text-danger-500" />,
      value: Math.max(0, gain.likes),
      label: t("profile.boosts.performance.likes"),
    },
    {
      key: "clicks",
      icon: <CursorArrowRaysIcon className="h-4 w-4 text-subtle" />,
      value: Math.max(0, gain.clicks),
      label: t("profile.boosts.performance.clicks"),
    },
  ];
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted">
        {t("profile.boosts.performance.title")}
      </p>
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-alt p-3 text-center">
        {cells.map((cell) => (
          <div key={cell.key}>
            <div className="flex items-center justify-center gap-1 text-lg font-bold text-heading">
              {cell.icon}
              {formatCount(cell.value)}
            </div>
            <div className="text-xs text-muted">{cell.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
