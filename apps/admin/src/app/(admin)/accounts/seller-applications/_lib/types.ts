import type { StatusConfig } from '@tarodan/ui';

export type Application = {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  companyName: string;
  taxId: string | null;
  businessStatus: 'pending' | 'approved' | 'rejected' | null;
  isSeller: boolean;
  createdAt: string;
};

export const STATUS_TABS = [
  { key: 'pending', label: 'Bekleyenler' },
  { key: 'approved', label: 'Onaylananlar' },
  { key: 'rejected', label: 'Reddedilenler' },
];

export const businessStatusConfig: Record<string, StatusConfig> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  approved: { label: 'Onaylandı', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
};
