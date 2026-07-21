import { XCircleIcon } from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import type { ScheduledNotification } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function scheduledRowMenu(onCancel: (id: string) => void, t: T) {
  return (n: ScheduledNotification): RowActionItem[] => [
    {
      label: t("admin.marketing.notifications.cancel"),
      icon: XCircleIcon,
      onClick: () => onCancel(n.id),
      destructive: true,
    },
  ];
}
