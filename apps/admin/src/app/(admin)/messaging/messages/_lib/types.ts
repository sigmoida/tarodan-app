import type { StatusConfig } from '@tarodan/ui';

export interface Message {
  id: string;
  content: string;
  originalContent: string;
  senderId: string;
  sender: { displayName: string; email: string };
  receiver: { displayName: string; email: string };
  status: 'pending' | 'approved' | 'rejected';
  flaggedReason: string;
  createdAt: string;
  threadId: string;
}

/** List filter options (frontend values; mapped to API status in the fetcher). */
export const messageFilterOptions = [
  { value: 'all', label: 'Tümü' },
  { value: 'pending', label: 'Bekleyenler' },
  { value: 'approved', label: 'Onaylananlar' },
  { value: 'rejected', label: 'Reddedilenler' },
];

export const messageStatusConfig: Record<string, StatusConfig> = {
  sent: { label: 'Gönderildi', variant: 'default' },
  pending: { label: 'Onay Bekliyor', variant: 'warning' },
  pending_approval: { label: 'Onay Bekliyor', variant: 'warning' },
  approved: { label: 'Onaylandı', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
};

/** Frontend filter value → API status ("pending" is stored as "pending_approval"). */
export function mapFilterToApiStatus(f: string | undefined): string | undefined {
  if (!f || f === 'all') return undefined;
  if (f === 'pending') return 'pending_approval';
  return f;
}

/** Normalize the varied message payload into the Message shape. */
export function mapMessage(m: any): Message {
  return {
    id: m.id,
    content: m.content || m.originalContent || '',
    originalContent: m.originalContent || m.content || '',
    senderId: m.senderId || m.sender?.id || '',
    sender: {
      displayName: m.sender?.displayName || m.senderName || 'Bilinmeyen',
      email: m.sender?.email || '',
    },
    receiver: {
      displayName: m.receiver?.displayName || m.receiverName || 'Bilinmeyen',
      email: m.receiver?.email || '',
    },
    status: (m.status === 'pending_approval' ? 'pending' : m.status) as Message['status'],
    flaggedReason: m.flaggedReason || '',
    createdAt: m.createdAt,
    threadId: m.threadId || m.thread?.id || '',
  };
}
