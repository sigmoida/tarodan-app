/** @format */

import SectionCard from "@/components/ui/SectionCard";
import { formatTL } from "@/lib/format";
import { useTranslations } from "next-intl";
import {
  ACTIVITY_CONFIG,
  FALLBACK_ACTIVITY,
  formatTimeAgo,
  type Activity,
} from "../_lib/types";

export default function RecentActivityCard({
  activity,
}: {
  activity: Activity[];
}) {
  const t = useTranslations();
  return (
    <SectionCard title="Son Aktiviteler">
      <div className="max-h-[300px] space-y-3 overflow-y-auto">
        {activity.map((item, index) => {
          const cfg = ACTIVITY_CONFIG(t)[item.type] ?? FALLBACK_ACTIVITY;
          const Icon = cfg.icon;
          return (
            <div
              key={index}
              className="flex items-start gap-3 rounded-lg bg-surface p-3 transition-colors hover:bg-surface-alt"
            >
              <div className={`rounded-lg p-2 ${cfg.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm text-heading">
                  <span className="font-medium">{item.productTitle}</span>{" "}
                  {cfg.text}
                  {item.amount ? (
                    <span className="font-semibold text-success-600">
                      {" "}
                      {formatTL(item.amount)}
                    </span>
                  ) : null}
                </p>
                {item.userDisplayName && (
                  <p className="text-xs text-muted">{item.userDisplayName}</p>
                )}
                <p className="mt-0.5 text-xs text-subtle">
                  {formatTimeAgo(item.timestamp, t)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
