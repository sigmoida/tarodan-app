import type { StatusConfig } from '@tarodan/ui';

export interface UserProduct {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  status: string;
  createdAt: string;
  imageUrl?: string;
}

export interface UserOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  commissionAmount: number;
  status: string;
  createdAt: string;
  role: 'buyer' | 'seller';
  otherParty: { id: string; displayName: string };
  product?: { id: string; title: string };
}

export interface UserTrade {
  id: string;
  tradeNumber?: string;
  status: string;
  createdAt: string;
  role: 'initiator' | 'receiver';
  cashAmount?: number;
  initiator?: { id: string; displayName: string };
  receiver?: { id: string; displayName: string };
  initiatorItems: Array<{ product: { id: string; title: string } }>;
  receiverItems: Array<{ product: { id: string; title: string } }>;
}

export interface UserRatingItem {
  id: string;
  score: number;
  comment?: string;
  createdAt: string;
  giver?: { id: string; displayName: string };
  receiver?: { id: string; displayName: string };
}

export interface UserDetail {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  isSeller: boolean;
  isVerified: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isBanned: boolean;
  bannedAt?: string;
  bannedReason?: string;
  sellerType?: string;
  companyName?: string;
  taxId?: string;
  bankAccount?: {
    accountHolder: string;
    iban: string;
    tcKimlikNo?: string | null;
    taxId?: string | null;
    isVerified: boolean;
    verifiedAt?: string | null;
  } | null;
  membership?: {
    tier: { name: string; type: string };
    status: string;
    startDate: string;
    endDate?: string;
    autoRenew?: boolean;
    cancelledAt?: string | null;
  };
  createdAt: string;
  lastLoginAt?: string;
  lastActivityAt?: string;
  averageRating?: number;
  addresses?: Array<{
    id: string;
    title: string;
    fullAddress: string;
    city: string;
    district: string;
    postalCode?: string;
    isDefault: boolean;
  }>;
  products?: UserProduct[];
  recentOrders?: UserOrder[];
  recentTrades?: UserTrade[];
  givenRatings?: UserRatingItem[];
  receivedRatings?: UserRatingItem[];
  stats?: {
    productsCount: number;
    ordersCount: number;
    buyerOrdersCount: number;
    sellerOrdersCount: number;
    tradesCount: number;
    initiatedTradesCount: number;
    receivedTradesCount: number;
    messagesCount: number;
    sentMessagesCount: number;
    receivedMessagesCount: number;
    givenRatingsCount: number;
    receivedRatingsCount: number;
  };
}

/** Order/product/trade status → badge, shared across the activity tabs. */
export const userStatusConfig: Record<string, StatusConfig> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  pending_payment: { label: 'Ödeme Bekliyor', variant: 'warning' },
  paid: { label: 'Ödendi', variant: 'info' },
  preparing: { label: 'Hazırlanıyor', variant: 'info' },
  shipped: { label: 'Kargoda', variant: 'primary' },
  delivered: { label: 'Teslim Edildi', variant: 'success' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  active: { label: 'Aktif', variant: 'success' },
  inactive: { label: 'Pasif', variant: 'secondary' },
  sold: { label: 'Satıldı', variant: 'primary' },
  accepted: { label: 'Kabul Edildi', variant: 'info' },
  both_shipped: { label: 'Gönderildi', variant: 'primary' },
  disputed: { label: 'İtirazlı', variant: 'danger' },
};

export const MEMBERSHIP_TIER_OPTIONS = [
  { value: 'free', label: 'Ücretsiz' },
  { value: 'basic', label: 'Temel' },
  { value: 'premium', label: 'Premium' },
  { value: 'business', label: 'Business' },
];

export const BILLING_PERIOD_OPTIONS = [
  { value: 'monthly', label: 'Aylık' },
  { value: 'yearly', label: 'Yıllık' },
];
