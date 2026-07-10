import { theme } from '@tarodan/ui-native';

const { colors } = theme;

// Faz 1'de subscriptionStore'dan buraya taşındı: abonelik ekranına ait tipler +
// saf durum-türetme yardımcıları. Store artık React Query hook'u (useSubscription).

export interface MembershipTier {
  id: string;
  name: string;
  type: 'free' | 'basic' | 'premium' | 'business';
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  limits: {
    maxListings: number;
    maxImagesPerListing: number;
    maxAddresses: number;
    maxSavedSearches: number;
    maxMessagesPerDay: number;
    listingExpireDays: number;
    canTrade: boolean;
    canCreateCollections: boolean;
    canFeatureListings: boolean;
  };
}

export interface Subscription {
  id: string;
  userId: string;
  tierId: string;
  tier: MembershipTier;
  status: 'active' | 'cancelled' | 'past_due' | 'expired';
  billingPeriod: 'monthly' | 'yearly';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
}

export interface BillingHistory {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  invoiceUrl?: string;
}

export const isPremiumTier = (tier: MembershipTier | null): boolean => {
  return tier?.type === 'premium' || tier?.type === 'business';
};

export const isSubscriptionActive = (subscription: Subscription | null): boolean => {
  if (!subscription) return false;
  // İptal edilmiş (cancelled) üyelik, ödenen dönem (currentPeriodEnd) bitene kadar
  // premium özelliklerini KULLANMAYA devam eder ("süre bitince üyelik gider").
  // past_due (ödeme onaylanmamış) premium sayılmaz; backend isPremiumEntitled ile aynı kural.
  const eligibleStatus = subscription.status === 'active' || subscription.status === 'cancelled';
  return eligibleStatus && new Date(subscription.currentPeriodEnd) > new Date();
};

export const getDaysUntilRenewal = (subscription: Subscription | null): number => {
  if (!subscription) return 0;
  const endDate = new Date(subscription.currentPeriodEnd);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const formatBillingPeriod = (period: 'monthly' | 'yearly'): string => {
  return period === 'monthly' ? 'Aylık' : 'Yıllık';
};

export const getSubscriptionStatusText = (status: Subscription['status']): { text: string; color: string } => {
  switch (status) {
    case 'active':
      return { text: 'Aktif', color: colors.success[600]! };
    case 'cancelled':
      return { text: 'İptal Edildi', color: colors.danger[500]! };
    case 'past_due':
      return { text: 'Ödeme Gecikmiş', color: colors.warning[500]! };
    case 'expired':
      return { text: 'Süresi Doldu', color: colors.gray[400] };
    default:
      return { text: 'Bilinmiyor', color: colors.gray[400] };
  }
};
