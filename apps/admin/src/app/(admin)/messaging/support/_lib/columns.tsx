import {
  Badge,
  enumLabel,
  ticketStatusConfig,
  ticketPriorityConfig,
  ticketCategoryConfig,
} from '@tarodan/ui';
import { col, type RowActionItem } from '@/components/table';
import type { SupportTicket, GuestContact } from './types';

/** Support ticket list columns — the ticket number links to the detail page. */
export const ticketColumns = [
  col.link<SupportTicket>('Talep No', (t) => ({
    href: `/messaging/support/${t.id}`,
    label: t.ticketNumber,
  })),
  col.text<SupportTicket>('Konu', (t) => t.subject, { grow: 3, minWidth: 200 }),
  col.user<SupportTicket>('Oluşturan', (t) => ({ name: t.creatorName || '—' })),
  col.muted<SupportTicket>('Kategori', (t) =>
    enumLabel(ticketCategoryConfig, t.category, t.category),
  ),
  col.badge<SupportTicket>('Öncelik', (t) => (
    <Badge status={t.priority} config={ticketPriorityConfig} />
  )),
  col.badge<SupportTicket>('Durum', (t) => (
    <Badge status={t.status} config={ticketStatusConfig} />
  )),
  col.date<SupportTicket>('Oluşturma', (t) => t.createdAt),
];

/** Guest contact list columns — the row menu opens the detail modal. */
export function guestColumns(rowMenu: (g: GuestContact) => RowActionItem[]) {
  return [
    col.code<GuestContact>('Referans', (g) => g.referenceNumber),
    col.user<GuestContact>('Ad Soyad', (g) => ({ name: g.name, secondary: g.email })),
    col.text<GuestContact>('Konu', (g) => g.subject, { grow: 3, minWidth: 200 }),
    col.date<GuestContact>('Tarih', (g) => g.createdAt),
    col.rowMenu<GuestContact>(rowMenu),
  ];
}
