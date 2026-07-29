import {
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  ChartBarIcon,
  ShieldExclamationIcon,
  ArrowRightOnRectangleIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  ArrowUturnLeftIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { type ComponentType } from "react";
import { type MetricTone } from "@/components/MetricCard";
import { type LogTab } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface StatCardDef {
  icon: ComponentType<{ className?: string }>;
  tone: MetricTone;
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
        icon: ExclamationTriangleIcon,
        tone: "danger",
        label: t("admin.system.logs.levels.critical"),
        value: stats.critical ?? 0,
      },
      {
        icon: ExclamationCircleIcon,
        tone: "warning",
        label: t("admin.system.logs.levels.error"),
        value: stats.error ?? 0,
      },
      {
        icon: InformationCircleIcon,
        tone: "info",
        label: t("admin.system.logs.levels.warning"),
        value: stats.warning ?? 0,
      },
      {
        icon: ChartBarIcon,
        tone: "primary",
        label: t("common.total"),
        value: total,
      },
    ];
  }
  if (tab === "security") {
    return [
      {
        icon: ShieldExclamationIcon,
        tone: "danger",
        label: t("admin.system.logs.stats.unresolvedCritical"),
        value: stats.unresolvedHighSeverity ?? 0,
      },
      {
        icon: ArrowRightOnRectangleIcon,
        tone: "warning",
        label: t("admin.system.logs.events.failedLogin"),
        value: stats.byEventType?.failed_login ?? 0,
      },
      {
        icon: NoSymbolIcon,
        tone: "info",
        label: t("admin.system.logs.events.ipBlock"),
        value: stats.byEventType?.ip_block ?? 0,
      },
      {
        icon: ChartBarIcon,
        tone: "primary",
        label: t("common.total"),
        value: total,
      },
    ];
  }
  if (tab === "emails") {
    return [
      {
        icon: CheckCircleIcon,
        tone: "success",
        label: t("admin.system.logs.stats.deliveryRate"),
        value: `${stats.deliveryRate ?? 0}%`,
      },
      {
        icon: ArrowUturnLeftIcon,
        tone: "danger",
        label: t("admin.system.logs.stats.bounceRate"),
        value: `${stats.bounceRate ?? 0}%`,
      },
      {
        icon: PaperAirplaneIcon,
        tone: "info",
        label: t("admin.system.logs.emailStatuses.sent"),
        value: stats.byStatus?.sent ?? 0,
      },
      {
        icon: ChartBarIcon,
        tone: "primary",
        label: t("common.total"),
        value: total,
      },
    ];
  }
  return [];
}
