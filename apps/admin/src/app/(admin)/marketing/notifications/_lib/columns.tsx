import {
  StatusBadge,
  enumLabel,
  notificationChannelConfig,
  deliveryStatusConfig,
} from '@tarodan/ui';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { col } from '@/components/table';
import { ActionButtons, ActionIconButton } from '@/components/admin-list';
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
    <StatusBadge status={n.status} config={deliveryStatusConfig} />
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
      <StatusBadge status={n.status} config={deliveryStatusConfig} />
    )),
    col.actions<ScheduledNotification>(
      (n) => (
        <ActionButtons>
          <ActionIconButton
            icon={XCircleIcon}
            onClick={() => onCancel(n.id)}
            title="İptal Et"
            variant="danger"
          />
        </ActionButtons>
      ),
      { header: 'İşlem' },
    ),
  ];
}
