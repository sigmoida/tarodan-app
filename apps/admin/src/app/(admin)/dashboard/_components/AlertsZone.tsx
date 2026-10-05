"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import type { DashboardAlert } from "@tarodan/types";
import { TextLink } from "@/components/TextLink";
import { fmtTry } from "@/lib/format";
import { ZoneHeader } from "./ZoneHeader";
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
      <ZoneHeader title={t("admin.dashboard.zones.alerts")} />
      <ul className="flex flex-col gap-2">
        {alerts.map((alert) => {
          const presentation = ALERT_PRESENTATION[alert.severity];
          const Icon = presentation.icon;
          return (
            <li key={alert.key}>
              <Alert
                variant={presentation.variant}
                icon={<Icon className="h-5 w-5" />}
              >
                <TextLink href={alert.href}>
                  {t(ALERT_MESSAGE_KEY[alert.key], {
                    count: alert.count,
                    // The copy names the threshold the API measured against, so
                    // the screen can never quote a number config has moved on
                    // from.
                    threshold: alert.threshold?.value ?? 0,
                    amount: fmtTry(alert.amount) ?? "—",
                  })}
                </TextLink>
              </Alert>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
