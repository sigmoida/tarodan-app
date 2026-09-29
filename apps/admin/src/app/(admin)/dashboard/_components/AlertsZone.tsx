"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { cn } from "@tarodan/ui";
import type { DashboardAlert } from "@tarodan/types";
import { fmtTry } from "@/lib/format";
import { ALERT_MESSAGE_KEY, ALERT_PRESENTATION } from "../_lib/zoneConfig";

/**
 * Zone B — things that should not be true. The strip disappears entirely when
 * every alert is at zero: an always-present panel full of green ticks is how a
 * real alarm gets ignored.
 */
export function AlertsZone({ alerts }: { alerts: DashboardAlert[] }) {
  const t = useTranslations();
  if (alerts.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-heading">
        {t("admin.dashboard.zones.alerts")}
      </h2>
      <ul className="flex flex-col gap-2">
        {alerts.map((alert) => {
          const presentation = ALERT_PRESENTATION[alert.severity];
          const Icon = presentation.icon;
          return (
            <li key={alert.key}>
              <Link
                href={alert.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 transition-opacity hover:opacity-90",
                  presentation.wrap,
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", presentation.icon_)} />
                <span className="min-w-0 flex-1 text-sm">
                  {t(ALERT_MESSAGE_KEY[alert.key], {
                    count: alert.count,
                    // The copy names the threshold the API measured against, so
                    // the screen can never quote a number config has moved on
                    // from.
                    threshold: alert.threshold?.value ?? 0,
                    amount: fmtTry(alert.amount) ?? "—",
                  })}
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
