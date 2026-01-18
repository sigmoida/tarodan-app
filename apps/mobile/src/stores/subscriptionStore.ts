import { create } from 'zustand';
import { api } from '../services/api';

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

interface SubscriptionState {
  subscription: Subscription | null;
  tiers: MembershipTier[];
  billingHistory: BillingHistory[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchSubscription: () => Promise<void>;
  fetchTiers: () => Promise<void>;
  fetchBillingHistory: () => Promise<void>;
  subscribe: (tierId: string, billingPeriod: 'monthly' | 'yearly') => Promise<{ paymentUrl?: string }>;
  cancelSubscription: () => Promise<void>;
  reactivateSubscription: () => Promise<void>;
  updatePaymentMethod: (paymentMethodId: string) => Promise<void>;
  clearError: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: null,
  tiers: [],
  billingHistory: [],
  isLoading: false,
  error: null,

  fetchSubscription: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/membership');
      set({ subscription: response.data, isLoading: false });
    } catch (error: any) {
      // If no subscription found, set to null (free tier)
      set({ subscription: null, isLoading: false });
    }
  },

  fetchTiers: async () => {
    try {
      const response = await api.get('/membership/tiers');
      set({ tiers: response.data });
    } catch (error: any) {
      console.error('Failed to fetch tiers:', error);
      // Set default tiers as fallback
      set({
        tiers: [
          {
            id: 'free',
            name: 'Ücretsiz',
            type: 'free',
            monthlyPrice: 0,
            yearlyPrice: 0,
            features: ['10 ilan', '5 fotoğraf/ilan', 'Temel analitik'],
            limits: {
              maxListings: 10,
              maxImagesPerListing: 5,
              maxAddresses: 3,
              maxSavedSearches: 5,
              maxMessagesPerDay: 50,
              listingExpireDays: 60,
              canTrade: false,
              canCreateCollections: false,
              canFeatureListings: false,
            },
          },
          {
            id: 'premium',
            name: 'Premium',
            type: 'premium',
            monthlyPrice: 99,
            yearlyPrice: 990,
            features: [
              'Sınırsız ilan',
              '15 fotoğraf/ilan',
              'Takas özelliği',
              'Dijital Garaj',
              'Öne çıkan ilanlar',
              'Gelişmiş analitik',
              'Öncelikli destek',
            ],
            limits: {
              maxListings: -1,
              maxImagesPerListing: 15,
              maxAddresses: 10,
              maxSavedSearches: -1,
              maxMessagesPerDay: -1,
              listingExpireDays: -1,
              canTrade: true,
              canCreateCollections: true,
              canFeatureListings: true,
            },
          },
        ],
      });
    }
  },

  fetchBillingHistory: async () => {
    try {
      const response = await api.get('/membership/billing-history');
      set({ billingHistory: response.data });
    } catch (error: any) {
      console.error('Failed to fetch billing history:', error);
      set({ billingHistory: [] });
    }
  },

  subscribe: async (tierId: string, billingPeriod: 'monthly' | 'yearly') => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/membership/subscribe', { tierId, billingPeriod });
      // Refresh subscription data
      await get().fetchSubscription();
      set({ isLoading: false });
      return { paymentUrl: response.data?.paymentUrl };
    } catch (error: any) {
      set({ 
        isLoading: false, 
        error: error.response?.data?.message || 'Abonelik oluşturulamadı' 
      });
      throw error;
    }
  },

  cancelSubscription: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/membership/cancel');
      await get().fetchSubscription();
      set({ isLoading: false });
    } catch (error: any) {
      set({ 
        isLoading: false, 
        error: error.response?.data?.message || 'Abonelik iptal edilemedi' 
      });
      throw error;
    }
  },

  reactivateSubscription: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/membership/reactivate');
      await get().fetchSubscription();
      set({ isLoading: false });
    } catch (error: any) {
      set({ 
        isLoading: false, 
        error: error.response?.data?.message || 'Abonelik yenilenemedi' 
      });
      throw error;
    }
  },

  updatePaymentMethod: async (paymentMethodId: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/membership/update-payment-method', { paymentMethodId });
      set({ isLoading: false });
    } catch (error: any) {
      set({ 
        isLoading: false, 
        error: error.response?.data?.message || 'Ödeme yöntemi güncellenemedi' 
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));

// Utility functions
export const isPremiumTier = (tier: MembershipTier | null): boolean => {
  return tier?.type === 'premium' || tier?.type === 'business';
};

export const isSubscriptionActive = (subscription: Subscription | null): boolean => {
  if (!subscription) return false;
  return subscription.status === 'active' && new Date(subscription.currentPeriodEnd) > new Date();
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
      return { text: 'Aktif', color: '#4CAF50' };
    case 'cancelled':
      return { text: 'İptal Edildi', color: '#F44336' };
    case 'past_due':
      return { text: 'Ödeme Gecikmiş', color: '#FF9800' };
    case 'expired':
      return { text: 'Süresi Doldu', color: '#9E9E9E' };
    default:
      return { text: 'Bilinmiyor', color: '#9E9E9E' };
  }
};
