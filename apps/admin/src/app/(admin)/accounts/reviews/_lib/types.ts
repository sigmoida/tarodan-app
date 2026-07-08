import type { StatusConfig } from '@tarodan/ui';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  id: string;
  score: number;
  title?: string;
  review?: string;
  status: ReviewStatus;
  adminReply?: string;
  adminReplyAt?: string;
  createdAt: string;
  isVerifiedPurchase: boolean;
  user: { id: string; displayName: string; email: string; avatar?: string };
  product: { id: string; title: string; images: { url: string }[] };
}

export interface UserRating {
  id: string;
  score: number;
  comment?: string;
  status?: ReviewStatus;
  createdAt: string;
  orderId?: string;
  tradeId?: string;
  giver: { id: string; displayName: string; email: string };
  receiver: { id: string; displayName: string; email: string };
}

export const reviewStatusConfig: Record<string, StatusConfig> = {
  approved: { label: 'Onaylı', variant: 'success' },
  pending: { label: 'Bekliyor', variant: 'warning' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
};

export const REVIEW_TABS = [
  { key: 'product', label: 'Ürün Yorumları' },
  { key: 'seller', label: 'Satıcı Yorumları' },
];

export const reviewStatusOptions = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'pending', label: 'Bekleyenler' },
  { value: 'approved', label: 'Onaylananlar' },
  { value: 'rejected', label: 'Reddedilenler' },
];

export const statusLabels: Record<ReviewStatus, string> = {
  approved: 'onaylandı',
  pending: 'beklemeye alındı',
  rejected: 'reddedildi',
};

/** Confirm-dialog copy per target status. */
export const REVIEW_ACTION_CONFIRM: Record<
  ReviewStatus,
  { title: string; description: string; confirmLabel: string; destructive?: boolean }
> = {
  approved: {
    title: 'Yorumu onayla',
    description: 'Bu yorum onaylanacak ve yayında görünecek.',
    confirmLabel: 'Onayla',
  },
  rejected: {
    title: 'Yorumu reddet',
    description: 'Bu yorum reddedilecek ve yayından kaldırılacak.',
    confirmLabel: 'Reddet',
    destructive: true,
  },
  pending: {
    title: 'Yorumu geri al',
    description: 'Yorum yeniden "Bekliyor" durumuna alınacak.',
    confirmLabel: 'Geri Al',
  },
};
