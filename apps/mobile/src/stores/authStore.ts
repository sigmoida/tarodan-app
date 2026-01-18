import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

// Membership tier types
export type MembershipTier = 'free' | 'basic' | 'premium' | 'business';
export type VerificationStatus = 'unverified' | 'verified';
export type SellerType = 'individual' | 'corporate';

// Extended User interface with all member fields
export interface User {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  avatar?: string;
  avatarUrl?: string;
  bio?: string;
  
  // Membership
  membershipTier: MembershipTier;
  
  // Verification
  isVerified: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  verificationStatus: VerificationStatus;
  
  // Seller info
  isSeller: boolean;
  sellerType?: SellerType;
  
  // Stats for verification criteria
  totalSales: number;
  totalPurchases: number;
  accountAge: number; // days since registration
  profileCompletion: number; // percentage 0-100
  disputeCount: number;
  
  // Listing limits
  listingCount: number;
  maxFreeListings: number;
  
  // Additional
  createdAt: string;
  
  // Rating
  rating?: number;
  totalRatings?: number;

  // Premium Profile Fields
  websiteUrl?: string;
  twitterHandle?: string;
  instagramHandle?: string;
  facebookUrl?: string;
  youtubeUrl?: string;
  customProfileSlug?: string;
  
  // Privacy Settings
  showEmail?: boolean;
  showPhone?: boolean;
  allowMessages?: boolean;
  
  // Reputation
  reputationLevel?: 'rising_star' | 'trusted_seller' | 'elite_collector' | 'hall_of_fame';
  specialRecognitions?: string[];
}

// Membership limits per tier
export interface MembershipLimits {
  maxListings: number;
  maxImagesPerListing: number;
  maxAddresses: number;
  maxSavedSearches: number;
  maxMessagesPerDay: number;
  listingExpireDays: number;
  maxReviewChars: number;
  maxValuePerListing: number; // TRY
  canTrade: boolean;
  canCreateCollections: boolean;
  canFeatureListings: boolean;
  canBulkUpload: boolean;
  canScheduleListings: boolean;
  priorityInSearch: boolean;
  isAdFree: boolean;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
  limits: MembershipLimits | null;
  
  // Actions
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  loadToken: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  refreshUserData: () => Promise<void>;
  
  // Helpers
  canCreateListing: () => boolean;
  getRemainingListings: () => number;
  isVerifiedMember: () => boolean;
  getMembershipLimits: () => MembershipLimits;
}

// Default limits for each tier
const TIER_LIMITS: Record<MembershipTier, MembershipLimits> = {
  free: {
    maxListings: 10,
    maxImagesPerListing: 5,
    maxAddresses: 3,
    maxSavedSearches: 5,
    maxMessagesPerDay: 50,
    listingExpireDays: 60,
    maxReviewChars: 500,
    maxValuePerListing: 5000, // Unverified: 5000 TRY
    canTrade: false,
    canCreateCollections: false,
    canFeatureListings: false,
    canBulkUpload: false,
    canScheduleListings: false,
    priorityInSearch: false,
    isAdFree: false,
  },
  basic: {
    maxListings: 25,
    maxImagesPerListing: 10,
    maxAddresses: 5,
    maxSavedSearches: 10,
    maxMessagesPerDay: 100,
    listingExpireDays: 90,
    maxReviewChars: 1000,
    maxValuePerListing: 10000,
    canTrade: false,
    canCreateCollections: false,
    canFeatureListings: false,
    canBulkUpload: false,
    canScheduleListings: false,
    priorityInSearch: false,
    isAdFree: false,
  },
  premium: {
    maxListings: -1, // Unlimited
    maxImagesPerListing: 15,
    maxAddresses: 10,
    maxSavedSearches: -1, // Unlimited
    maxMessagesPerDay: -1, // Unlimited
    listingExpireDays: -1, // Never expire
    maxReviewChars: 2000,
    maxValuePerListing: 50000, // Verified: 50000 TRY
    canTrade: true,
    canCreateCollections: true,
    canFeatureListings: true,
    canBulkUpload: true,
    canScheduleListings: true,
    priorityInSearch: true,
    isAdFree: true,
  },
  business: {
    maxListings: -1,
    maxImagesPerListing: 20,
    maxAddresses: -1,
    maxSavedSearches: -1,
    maxMessagesPerDay: -1,
    listingExpireDays: -1,
    maxReviewChars: 5000,
    maxValuePerListing: -1, // No limit
    canTrade: true,
    canCreateCollections: true,
    canFeatureListings: true,
    canBulkUpload: true,
    canScheduleListings: true,
    priorityInSearch: true,
    isAdFree: true,
  },
};

// Helper to extract membership tier from various API formats
const extractMembershipTier = (apiUser: any): MembershipTier => {
  // Check various possible paths for membership tier
  const tier = 
    apiUser.membership?.tier?.type ||
    apiUser.membership?.tier?.name ||
    apiUser.membership?.tier ||
    apiUser.membership?.name ||
    apiUser.membershipTier ||
    apiUser.membership_tier ||
    'free';
  
  // Normalize the tier name
  const normalizedTier = String(tier).toLowerCase();
  
  if (normalizedTier.includes('premium') || normalizedTier === 'premium') return 'premium';
  if (normalizedTier.includes('business') || normalizedTier === 'business') return 'business';
  if (normalizedTier.includes('basic') || normalizedTier === 'basic') return 'basic';
  return 'free';
};

// Default user values for mapping API response
const mapApiUserToUser = (apiUser: any): User => {
  const membershipTier = extractMembershipTier(apiUser);
  
  return {
  id: apiUser.id,
  email: apiUser.email,
  displayName: apiUser.displayName || apiUser.display_name || '',
  phone: apiUser.phone,
  avatar: apiUser.avatar || apiUser.avatarUrl || apiUser.avatar_url,
  avatarUrl: apiUser.avatarUrl || apiUser.avatar_url,
  bio: apiUser.bio,
  
  // Membership - properly extracted
  membershipTier,
  
  // Verification
  isVerified: apiUser.isVerified || apiUser.is_verified || false,
  isEmailVerified: apiUser.isEmailVerified || apiUser.is_email_verified || false,
  isPhoneVerified: apiUser.isPhoneVerified || apiUser.is_phone_verified || false,
  verificationStatus: (apiUser.isVerified || apiUser.is_verified) ? 'verified' : 'unverified',
  
  // Seller
  isSeller: apiUser.isSeller || apiUser.is_seller || false,
  sellerType: apiUser.sellerType || apiUser.seller_type,
  
  // Stats
  totalSales: apiUser.totalSales || apiUser.total_sales || 0,
  totalPurchases: apiUser.totalPurchases || apiUser.total_purchases || 0,
  accountAge: apiUser.accountAge || calculateAccountAge(apiUser.createdAt || apiUser.created_at),
  profileCompletion: apiUser.profileCompletion || calculateProfileCompletion(apiUser),
  disputeCount: apiUser.disputeCount || apiUser.dispute_count || 0,
  
  // Listing limits
  listingCount: apiUser.listingCount || apiUser.listing_count || 0,
  maxFreeListings: apiUser.maxFreeListings || apiUser.max_free_listings || 10,
  
  createdAt: apiUser.createdAt || apiUser.created_at || new Date().toISOString(),
  
  // Rating
  rating: apiUser.rating,
  totalRatings: apiUser.totalRatings || apiUser.total_ratings,
  
  // Premium Profile Fields
  websiteUrl: apiUser.websiteUrl || apiUser.website_url,
  twitterHandle: apiUser.twitterHandle || apiUser.twitter_handle,
  instagramHandle: apiUser.instagramHandle || apiUser.instagram_handle,
  facebookUrl: apiUser.facebookUrl || apiUser.facebook_url,
  youtubeUrl: apiUser.youtubeUrl || apiUser.youtube_url,
  customProfileSlug: apiUser.customProfileSlug || apiUser.custom_profile_slug,
  
  // Privacy Settings
  showEmail: apiUser.showEmail ?? apiUser.show_email ?? false,
  showPhone: apiUser.showPhone ?? apiUser.show_phone ?? false,
  allowMessages: apiUser.allowMessages ?? apiUser.allow_messages ?? true,
  
  // Reputation
  reputationLevel: apiUser.reputationLevel || apiUser.reputation_level,
  specialRecognitions: apiUser.specialRecognitions || apiUser.special_recognitions || [],
};
};

// Helper to calculate account age in days
const calculateAccountAge = (createdAt?: string): number => {
  if (!createdAt) return 0;
  const created = new Date(createdAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - created.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Helper to calculate profile completion percentage
const calculateProfileCompletion = (user: any): number => {
  const fields = [
    'displayName',
    'email',
    'phone',
    'avatarUrl',
    'bio',
  ];
  
  let completed = 0;
  fields.forEach(field => {
    const value = user[field] || user[field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)];
    if (value && value.toString().trim() !== '') {
      completed++;
    }
  });
  
  return Math.round((completed / fields.length) * 100);
};

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  token: null,
  limits: null,

  login: async (token: string, user: User) => {
    await SecureStore.setItemAsync('accessToken', token);
    const mappedUser = mapApiUserToUser(user);
    const limits = TIER_LIMITS[mappedUser.membershipTier];
    set({ isAuthenticated: true, token, user: mappedUser, limits });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Ignore logout errors
    }
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    set({ isAuthenticated: false, token: null, user: null, limits: null });
  },

  loadToken: async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        // Validate token by fetching user profile
        const response = await api.get('/users/me');
        const mappedUser = mapApiUserToUser(response.data);
        const limits = TIER_LIMITS[mappedUser.membershipTier];
        set({
          isAuthenticated: true,
          token,
          user: mappedUser,
          limits,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      // Token invalid or expired
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      set({ isAuthenticated: false, token: null, user: null, limits: null, isLoading: false });
    }
  },

  updateUser: (userData: Partial<User>) => {
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser = { ...currentUser, ...userData };
      const limits = TIER_LIMITS[updatedUser.membershipTier];
      set({ user: updatedUser, limits });
    }
  },

  refreshUserData: async () => {
    try {
      const response = await api.get('/users/me');
      const mappedUser = mapApiUserToUser(response.data);
      const limits = TIER_LIMITS[mappedUser.membershipTier];
      set({ user: mappedUser, limits });
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  },

  // Helper methods
  canCreateListing: () => {
    const { user, limits } = get();
    if (!user || !limits) return false;
    if (limits.maxListings === -1) return true; // Unlimited
    return user.listingCount < limits.maxListings;
  },

  getRemainingListings: () => {
    const { user, limits } = get();
    if (!user || !limits) return 0;
    if (limits.maxListings === -1) return -1; // Unlimited
    return Math.max(0, limits.maxListings - user.listingCount);
  },

  isVerifiedMember: () => {
    const { user } = get();
    if (!user) return false;
    
    // Verification criteria for Free members
    const hasCompletedTransaction = user.totalSales > 0 || user.totalPurchases > 0;
    const accountOldEnough = user.accountAge >= 30;
    const noDisputes = user.disputeCount === 0;
    const profileComplete = user.profileCompletion >= 80;
    
    return user.isEmailVerified && 
           user.isPhoneVerified && 
           hasCompletedTransaction && 
           accountOldEnough && 
           noDisputes && 
           profileComplete;
  },

  getMembershipLimits: () => {
    const { user } = get();
    const tier = user?.membershipTier || 'free';
    return TIER_LIMITS[tier];
  },
}));

export default useAuthStore;
