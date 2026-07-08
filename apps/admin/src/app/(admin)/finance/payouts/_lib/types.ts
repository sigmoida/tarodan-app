import { ListBulletIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';

export interface PayoutSummary {
  totalPending: number;
  totalReleased: number;
  countHeld: number;
  countReleased: number;
  nextReleases: Array<{
    id: string;
    orderId: string;
    amount: number;
    releaseAt: string | null;
    sellerId: string;
  }>;
}

export interface PayoutTransaction {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  amount: number;
  status: string;
  releaseAt: string | null;
  releasedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface ScheduleItem {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  amount: number;
  releaseAt: string | null;
  createdAt: string;
}

export const PAYOUT_TABS = [
  { key: 'transactions', label: 'İşlem Geçmişi', icon: ListBulletIcon },
  { key: 'schedule', label: 'Ödeme Takvimi', icon: CalendarDaysIcon },
];

export const payoutStatusFilterOptions = [
  { value: 'all', label: 'Tüm durumlar' },
  { value: 'held', label: 'Tutuluyor' },
  { value: 'released', label: 'Serbest Bırakıldı' },
  { value: 'cancelled', label: 'İptal Edildi' },
];
