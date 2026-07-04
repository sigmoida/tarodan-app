import {
  Badge,
  enumLabel,
  notificationChannelConfig,
  deliveryStatusConfig,
} from '@tarodan/ui';
import { col } from '@/components/table';
import { scheduledRowMenu } from './rowActions';
import { type NotificationLog, type ScheduledNotification } from './types';

export const historyColumns = [
  col.user<NotificationLog>('Kullanıcı', (n) => ({
    name: n.user?.displayName || n.userId,
    secondary: n.user?.email,
  })),
  col.muted<NotificationLog>('Kanal', (n) =>
    enumLabel(notificationChannelConfig, n.channel),
  ),
  col.text<NotificationLog>('Başlık', (n) => n.title, { grow: 3, minWidth: 200 }),
  col.badge<NotificationLog>('Durum', (n) => (
    <Badge status={n.status} config={deliveryStatusConfig} />
  )),
  col.date<NotificationLog>('Tarih', (n) => n.createdAt),
];

export function scheduledColumns(onCancel: (id: string) => void) {
  return [
    col.text<ScheduledNotification>('Başlık', (n) => n.title, { grow: 3, minWidth: 200 }),
    col.muted<ScheduledNotification>('Kanallar', (n) => n.channels?.join(', ')),
    col.muted<ScheduledNotification>('Hedef', (n) => n.targetType),
    col.date<ScheduledNotification>('Tarih', (n) => n.scheduledFor),
    col.badge<ScheduledNotification>('Durum', (n) => (
      <Badge status={n.status} config={deliveryStatusConfig} />
    )),
    col.rowMenu<ScheduledNotification>(scheduledRowMenu(onCancel)),
  ];
}
