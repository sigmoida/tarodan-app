import { Badge } from '@tarodan/ui';
import { col, type RowActionItem } from '@/components/table';
import { type Message, messageStatusConfig } from './types';

export function messageColumns(rowMenu: (m: Message) => RowActionItem[]) {
  return [
    col.user<Message>('Gönderen', (m) => ({
      name: m.sender.displayName,
      secondary: m.sender.email,
    })),
    col.user<Message>('Alıcı', (m) => ({
      name: m.receiver.displayName,
      secondary: m.receiver.email,
    })),
    col.text<Message>('Mesaj', (m) => m.originalContent || m.content, { grow: 3, minWidth: 220 }),
    col.badge<Message>('Uyarı', (m) =>
      m.flaggedReason ? (
        <Badge variant="warning">{m.flaggedReason}</Badge>
      ) : (
        <span className="text-muted">—</span>
      ),
    ),
    col.badge<Message>('Durum', (m) => (
      <Badge status={m.status} config={messageStatusConfig} />
    )),
    col.date<Message>('Tarih', (m) => m.createdAt),
    col.rowMenu<Message>(rowMenu),
  ];
}
