import {
  ticketStatusConfig,
  ticketPriorityConfig,
  ticketCategoryConfig,
} from '@tarodan/ui';
import { statusFilterOptions } from '@/lib/utils';

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuestContact {
  referenceNumber: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  status: string;
}

export const SUPPORT_TABS = [
  { key: 'tickets', label: 'Talepler' },
  { key: 'guest', label: 'Misafir Mesajları' },
];

/** Toolbar filter options, derived from the shared ticket status configs. */
export const ticketStatusOptions = statusFilterOptions(ticketStatusConfig, {
  allLabel: 'Tüm Durumlar',
});
export const ticketPriorityOptions = statusFilterOptions(ticketPriorityConfig, {
  allLabel: 'Tüm Öncelikler',
});
export const ticketCategoryOptions = statusFilterOptions(ticketCategoryConfig, {
  allLabel: 'Tüm Kategoriler',
});

/** Status choices for the detail status-change modal (no "all" option). */
export const TICKET_STATUS_CHOICES = Object.entries(ticketStatusConfig).map(
  ([value, cfg]) => ({ value, label: cfg.label }),
);
