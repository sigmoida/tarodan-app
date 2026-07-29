import {
  Badge,
  enumLabel,
  notificationChannelConfig,
  deliveryStatusConfig,
} from "@tarodan/ui";
import { col } from "@/components/table";
import { scheduledRowMenu } from "./rowActions";
import { type NotificationLog, type ScheduledNotification } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export const historyColumns = (t: T) => [
  col.user<NotificationLog>(
    t("common.user"),
    (n) => ({
      name: n.user?.displayName || n.userId,
      secondary: n.user?.email,
      href: n.userId ? `/accounts/users/${n.userId}` : undefined,
    }),
    { sortKey: "user.displayName", sortType: "text" },
  ),
  col.muted<NotificationLog>(
    t("admin.marketing.notifications.channelLabel"),
    (n) => enumLabel(notificationChannelConfig, n.channel),
    { sortKey: "channel", sortType: "text" },
  ),
  col.text<NotificationLog>(t("common.title"), "title", {
    grow: 3,
    minWidth: 200,
  }),
  col.badge<NotificationLog>(
    t("common.status"),
    (n) => <Badge status={n.status} config={deliveryStatusConfig} />,
    { sortKey: "status", sortType: "text" },
  ),
  col.date<NotificationLog>(t("common.date"), "createdAt"),
];

export function scheduledColumns(onCancel: (id: string) => void, t: T) {
  return [
    col.text<ScheduledNotification>(t("common.title"), "title", {
      grow: 3,
      minWidth: 200,
    }),
    col.muted<ScheduledNotification>(
      t("admin.marketing.notifications.channels"),
      (n) => n.channels?.join(", "),
      { sortKey: "channels", sortType: "text" },
    ),
    col.muted<ScheduledNotification>(
      t("admin.marketing.notifications.targetLabel"),
      "targetType",
    ),
    col.date<ScheduledNotification>(t("common.date"), "scheduledFor"),
    col.badge<ScheduledNotification>(
      t("common.status"),
      (n) => <Badge status={n.status} config={deliveryStatusConfig} />,
      { sortKey: "status", sortType: "text" },
    ),
    col.rowMenu<ScheduledNotification>(scheduledRowMenu(onCancel, t)),
  ];
}
