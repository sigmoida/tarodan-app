import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, userApi } from '@/lib/api';

// Membership tier types
export type MembershipTier = 'free' | 'basic' | 'premium' | 'business';

interface User {
  id: string;
  email: string;
  phone?: string;
  displayName: string;
  isVerified: boolean;
  isSeller: boolean;
  sellerType?: string;
  createdAt: Date;
  isAdmin?: boolean;
  role?: string;
  
  // Membership
  membershipTier: MembershipTier;
  membership?: {
    tier: { type: string; name: string } | string;
    expiresAt?: string;
  };
  
  // Stats
  listingCount?: number;
  totalSales?: number;
  totalPurchases?: number;
  rating?: number;
  totalRatings?: number;
  
  // Profile
  avatarUrl?: string;
  bio?: string;
}

// Membership limits per tier
export interface MembershipLimits {
  maxListings: number;
  maxImagesPerListing: number;
  canTrade: boolean;
  canCreateCollections: boolean;
}

const TIER_LIMITS: Record<MembershipTier, MembershipLimits> = {
  free: {
    maxListings: 10,
    maxImagesPerListing: 5,
    canTrade: false,
    canCreateCollections: false,
  },
  basic: {
    maxListings: 50,
    maxImagesPerListing: 6,
    canTrade: true,
    canCreateCollections: true,
  },
  premium: {
    maxListings: -1,
    maxImagesPerListing: 15,
    canTrade: true,
    canCreateCollections: true,
  },
  business: {
    maxListings: -1,
    maxImagesPerListing: 20,
    canTrade: true,
    canCreateCollections: true,
  },
};

// Extract membership tier from API response
const extractMembershipTier = (user: any): MembershipTier => {
  const tier = 
    user.membership?.tier?.type ||
    user.membership?.tier?.name ||
    user.membership?.tier ||
    user.membership?.name ||
    user.membershipTier ||
    user.membership_tier ||
    'free';
  
  const normalizedTier = String(tier).toLowerCase();
  
  if (normalizedTier.includes('premium') || normalizedTier === 'premium') return 'premium';
  if (normalizedTier.includes('business') || normalizedTier === 'business') return 'business';
  if (normalizedTier.includes('basic') || normalizedTier === 'basic') return 'premium'; // BASIC üyeleri PREMIUM'a map et
  return 'free';
};

// Map API user to store user
const mapApiUser = (apiUser: any): User => ({
  id: apiUser.id,
  email: apiUser.email,
  phone: apiUser.phone,
  displayName: apiUser.displayName || apiUser.display_name || '',
  isVerified: apiUser.isVerified || apiUser.is_verified || false,
  isSeller: apiUser.isSeller || apiUser.is_seller || false,
  sellerType: apiUser.sellerType || apiUser.seller_type,
  createdAt: apiUser.createdAt || apiUser.created_at,
  isAdmin: apiUser.isAdmin || apiUser.is_admin || apiUser.role === 'admin',
  role: apiUser.role,
  membershipTier: extractMembershipTier(apiUser),
  membership: apiUser.membership,
  listingCount: apiUser.listingCount || apiUser.listing_count || apiUser._count?.products || 0,
  totalSales: apiUser.totalSales || apiUser.total_sales || 0,
  totalPurchases: apiUser.totalPurchases || apiUser.total_purchases || 0,
  rating: apiUser.rating,
  totalRatings: apiUser.totalRatings || apiUser.total_ratings || 0,
  avatarUrl: apiUser.avatarUrl || apiUser.avatar_url,
  bio: apiUser.bio,
});

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  limits: MembershipLimits | null;
  
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, phone?: string, birthDate?: string, acceptMarketing?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  refreshUserData: () => Promise<void>; // Alias for refreshUser
  
  // Helper methods
  canCreateListing: () => boolean;
  getRemainingListings: () => number;
  getMembershipLimits: () => MembershipLimits;
}

// Sync read from localStorage on client so first paint has correct auth state (no "giriş yapın" flash).
function getInitialAuthFromStorage(): Pick<AuthState, 'token' | 'refreshToken' | 'isAuthenticated' | 'isLoading'> {
  if (typeof window === 'undefined') {
    return { token: null, refreshToken: null, isAuthenticated: false, isLoading: true };
  }
  const token = localStorage.getItem('auth_token');
  const refreshToken = localStorage.getItem('refresh_token');
  const hasToken = !!token;
  return {
    token,
    refreshToken,
    isAuthenticated: hasToken,
    // When we have a token, keep isLoading true until checkAuth() validates and loads user.
    isLoading: true,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      const initial = getInitialAuthFromStorage();
      return {
      user: null,
      token: initial.token,
      refreshToken: initial.refreshToken,
      isAuthenticated: initial.isAuthenticated,
      isLoading: initial.isLoading,
      limits: null,
      
      login: async (email: string, password: string) => {
        const response = await authApi.login(email, password);
        const { user: apiUser, tokens } = response.data;
        const token = tokens.accessToken;
        const refreshToken = tokens.refreshToken;
        
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', token);
          if (refreshToken) {
            localStorage.setItem('refresh_token', refreshToken);
          }
        }
        
        const user = mapApiUser(apiUser);
        const limits = TIER_LIMITS[user.membershipTier];
        
        set({ user, token, refreshToken, isAuthenticated: true, limits });
      },
      
      register: async (displayName: string, email: string, password: string, phone?: string, birthDate?: string, acceptMarketing?: boolean) => {
        await authApi.register({ displayName, email, password, phone, birthDate, acceptsMarketingEmails: acceptMarketing });
        // Don't auto-login after registration - user must verify email first
        // await get().login(email, password);
      },
      
      logout: async () => {
        try {
          await authApi.logout();
        } catch (e) {
          // Ignore logout errors
        }
        
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
        }
        
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false, limits: null, isLoading: false });
      },
      
      checkAuth: async () => {
        const token = typeof window !== 'undefined' 
          ? localStorage.getItem('auth_token') 
          : null;
        const refreshToken = typeof window !== 'undefined'
          ? localStorage.getItem('refresh_token')
          : null;

        if (!token) {
          set({ user: null, token: null, refreshToken: null, isAuthenticated: false, limits: null, isLoading: false });
          return;
        }

        set({ isLoading: true });
        try {
          // Use /users/me for more complete profile data
          const response = await userApi.getProfile();
          const apiUser = response.data.user || response.data;
          const user = mapApiUser(apiUser);
          const limits = TIER_LIMITS[user.membershipTier];
          set({ user, token, refreshToken, isAuthenticated: true, limits });
        } catch (error) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('refresh_token');
          }
          set({ user: null, token: null, refreshToken: null, isAuthenticated: false, limits: null });
        } finally {
          set({ isLoading: false });
        }
      },
      
      setUser: (user) => {
        const limits = user ? TIER_LIMITS[user.membershipTier] : null;
        set({ user, isAuthenticated: !!user, limits });
      },
      
      refreshUser: async () => {
        try {
          // Use /users/me for more complete profile data
          const response = await userApi.getProfile();
          const apiUser = response.data.user || response.data;
          const user = mapApiUser(apiUser);
          const limits = TIER_LIMITS[user.membershipTier];
          set({ user, limits });
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to refresh user:', error);
          }
        }
      },
      
      // Alias for refreshUser
      refreshUserData: async () => {
        return get().refreshUser();
      },
      
      // Helper methods
      canCreateListing: () => {
        const { user, limits } = get();
        if (!user || !limits) return false;
        if (limits.maxListings === -1) return true;
        return (user.listingCount || 0) < limits.maxListings;
      },
      
      getRemainingListings: () => {
        const { user, limits } = get();
        if (!user || !limits) return 0;
        if (limits.maxListings === -1) return -1;
        return Math.max(0, limits.maxListings - (user.listingCount || 0));
      },
      
      getMembershipLimits: () => {
        const { user } = get();
        return TIER_LIMITS[user?.membershipTier || 'free'];
      },
    };
    },
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, refreshToken: state.refreshToken }),
    }
  )
);

export default useAuthStore;


