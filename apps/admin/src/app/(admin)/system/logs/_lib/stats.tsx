import { type LogTab } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface StatCardDef {
  label: string;
  value: string | number;
}

/** Build the metric cards for a tab from its stats payload + total count. */
export function statCards(
  tab: LogTab,
  stats: any,
  total: number,
  t: T,
): StatCardDef[] {
  if (!stats) return [];
  if (tab === "errors") {
    return [
      {
        label: t("admin.system.logs.levels.error"),
        value: stats.error ?? 0,
      },
      {
        label: t("admin.system.logs.levels.warning"),
        value: stats.warning ?? 0,
      },
      {
        label: t("common.total"),
        value: total,
      },
    ];
  }
  if (tab === "security") {
    return [
      {
        label: t("admin.system.logs.stats.unresolvedCritical"),
        value: stats.unresolvedHighSeverity ?? 0,
      },
      {
        label: t("admin.system.logs.events.failedLogin"),
        value: stats.byEventType?.failed_login ?? 0,
      },
      {
        label: t("admin.system.logs.events.ipBlock"),
        value: stats.byEventType?.ip_block ?? 0,
      },
      {
        label: t("common.total"),
        value: total,
      },
    ];
  }
  if (tab === "emails") {
    return [
      {
        // `delivered`/`bounced` hiç yazılmadığı için eski teslimat/bounce
        // oranları daima %0'dı; bu oran gerçekten hesaplanabilir.
        label: t("admin.system.logs.stats.failureRate"),
        value: `${stats.failureRate ?? 0}%`,
      },
      {
        label: t("admin.system.logs.emailStatuses.sent"),
        value: stats.byStatus?.sent ?? 0,
      },
      {
        label: t("common.total"),
        value: total,
      },
    ];
  }
  return [];
}
