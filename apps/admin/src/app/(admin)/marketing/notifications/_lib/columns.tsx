import {
  Badge,
  enumLabel,
  notificationChannelConfig,
  deliveryStatusConfig,
} from "@tarodan/ui";
import { col } from "@/components/table";
import { scheduledRowMenu } from "./rowActions";
import { type NotificationLog, type ScheduledNotification } from "./types";

export const historyColumns = [
  col.user<NotificationLog>(
    "Kullanıcı",
    (n) => ({
      name: n.user?.displayName || n.userId,
      secondary: n.user?.email,
    }),
    { sortKey: "user.displayName", sortType: "text" },
  ),
  col.muted<NotificationLog>(
    "Kanal",
    (n) => enumLabel(notificationChannelConfig, n.channel),
    { sortKey: "channel", sortType: "text" },
  ),
  col.text<NotificationLog>("Başlık", "title", { grow: 3, minWidth: 200 }),
  col.badge<NotificationLog>(
    "Durum",
    (n) => <Badge status={n.status} config={deliveryStatusConfig} />,
    { sortKey: "status", sortType: "text" },
  ),
  col.date<NotificationLog>("Tarih", "createdAt"),
];

export function scheduledColumns(onCancel: (id: string) => void) {
  return [
    col.text<ScheduledNotification>("Başlık", "title", {
      grow: 3,
      minWidth: 200,
    }),
    col.muted<ScheduledNotification>(
      "Kanallar",
      (n) => n.channels?.join(", "),
      { sortKey: "channels", sortType: "text" },
    ),
    col.muted<ScheduledNotification>("Hedef", "targetType"),
    col.date<ScheduledNotification>("Tarih", "scheduledFor"),
    col.badge<ScheduledNotification>(
      "Durum",
      (n) => <Badge status={n.status} config={deliveryStatusConfig} />,
      { sortKey: "status", sortType: "text" },
    ),
    col.rowMenu<ScheduledNotification>(scheduledRowMenu(onCancel)),
  ];
}
