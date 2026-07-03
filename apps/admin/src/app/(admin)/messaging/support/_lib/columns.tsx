import {
  StatusBadge,
  enumLabel,
  ticketStatusConfig,
  ticketPriorityConfig,
  ticketCategoryConfig,
} from '@tarodan/ui';
import { col } from '@/components/table';
import type { SupportTicket, GuestContact } from './types';

/** Support ticket list columns — row click navigates to the detail page. */
export const ticketColumns = [
  col.code<SupportTicket>('Talep No', (t) => t.ticketNumber),
  col.text<SupportTicket>('Konu', (t) => t.subject, { grow: 3, minWidth: 200 }),
  col.user<SupportTicket>('Oluşturan', (t) => ({ name: t.creatorName || '—' })),
  col.muted<SupportTicket>('Kategori', (t) =>
    enumLabel(ticketCategoryConfig, t.category, t.category),
  ),
  col.badge<SupportTicket>('Öncelik', (t) => (
    <StatusBadge status={t.priority} config={ticketPriorityConfig} />
  )),
  col.badge<SupportTicket>('Durum', (t) => (
    <StatusBadge status={t.status} config={ticketStatusConfig} />
  )),
  col.date<SupportTicket>('Oluşturma', (t) => t.createdAt),
];

/** Guest contact list columns — row click opens the detail modal. */
export const guestColumns = [
  col.code<GuestContact>('Referans', (g) => g.referenceNumber),
  col.user<GuestContact>('Ad Soyad', (g) => ({ name: g.name, secondary: g.email })),
  col.text<GuestContact>('Konu', (g) => g.subject, { grow: 3, minWidth: 200 }),
  col.date<GuestContact>('Tarih', (g) => g.createdAt),
];
