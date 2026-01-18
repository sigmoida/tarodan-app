/**
 * Membership Limits Utility
 * Provides helper functions for checking user membership limits and permissions
 */

import { useAuthStore, MembershipTier, MembershipLimits } from '../stores/authStore';

// Free member specific limits
export const FREE_MEMBER_LIMITS = {
  maxListings: 10,
  maxImagesPerListing: 5,
  maxAddresses: 3,
  maxSavedSearches: 5,
  maxMessagesPerDay: 50,
  listingExpireDays: 60,
  maxReviewChars: 500,
  maxValuePerListing: 5000, // TRY - increases to 5000 when verified
  canTrade: false,
  canCreateCollections: false,
  canFeatureListings: false,
  canBulkUpload: false,
  canScheduleListings: false,
  priorityInSearch: false,
  isAdFree: false,
};

// Premium member limits
export const PREMIUM_MEMBER_LIMITS = {
  maxListings: -1, // Unlimited
  maxImagesPerListing: 15,
  maxAddresses: 10,
  maxSavedSearches: -1, // Unlimited
  maxMessagesPerDay: -1, // Unlimited
  listingExpireDays: -1, // Never expire
  maxReviewChars: 2000,
  maxValuePerListing: 50000, // TRY for verified premium
  canTrade: true,
  canCreateCollections: true,
  canFeatureListings: true,
  canBulkUpload: true,
  canScheduleListings: true,
  priorityInSearch: true,
  isAdFree: true,
};

// Feature check types
export type FeatureCheck = 
  | 'createListing'
  | 'trade'
  | 'createCollection'
  | 'featureListing'
  | 'bulkUpload'
  | 'scheduleListing'
  | 'saveFavorites'
  | 'messageUsers'
  | 'rateProducts'
  | 'rateSellers'
  | 'writeReviews'
  | 'followSellers'
  | 'reportContent'
  | 'blockUsers'
  | 'viewAnalytics'
  | 'saveSearch';

// Upgrade prompt types
export type UpgradePromptType =
  | 'listingLimit'
  | 'tradeFeature'
  | 'collectionFeature'
  | 'featureListing'
  | 'messageLimit'
  | 'addressLimit'
  | 'savedSearchLimit'
  | 'imageLimit'
  | 'valueLimit';

// Check if user can perform a specific action
export const canPerformAction = (action: FeatureCheck): boolean => {
  const { user, limits, isAuthenticated } = useAuthStore.getState();
  
  if (!isAuthenticated || !user) {
    // Guest restrictions - most actions not allowed
    const guestAllowed: FeatureCheck[] = [];
    return guestAllowed.includes(action);
  }
  
  // Free member - all basic actions allowed
  switch (action) {
    case 'createListing':
      return limits ? (limits.maxListings === -1 || user.listingCount < limits.maxListings) : false;
    
    case 'trade':
      return limits?.canTrade || false;
    
    case 'createCollection':
      return limits?.canCreateCollections || false;
    
    case 'featureListing':
      return limits?.canFeatureListings || false;
    
    case 'bulkUpload':
      return limits?.canBulkUpload || false;
    
    case 'scheduleListing':
      return limits?.canScheduleListings || false;
    
    // These are allowed for all authenticated users
    case 'saveFavorites':
    case 'messageUsers':
    case 'rateProducts':
    case 'rateSellers':
    case 'writeReviews':
    case 'followSellers':
    case 'reportContent':
    case 'blockUsers':
    case 'viewAnalytics':
    case 'saveSearch':
      return true;
    
    default:
      return false;
  }
};

// Get the appropriate upgrade prompt for a blocked action
export const getUpgradePrompt = (action: FeatureCheck): UpgradePromptType | null => {
  const { limits } = useAuthStore.getState();
  
  if (!limits) return null;
  
  switch (action) {
    case 'createListing':
      return 'listingLimit';
    case 'trade':
      return 'tradeFeature';
    case 'createCollection':
      return 'collectionFeature';
    case 'featureListing':
      return 'featureListing';
    default:
      return null;
  }
};

// Get upgrade message based on prompt type
export const getUpgradeMessage = (promptType: UpgradePromptType): { title: string; message: string } => {
  switch (promptType) {
    case 'listingLimit':
      return {
        title: 'İlan Limitine Ulaştınız',
        message: 'Sınırsız ilan vermek için Premium üyeliğe geçin.',
      };
    case 'tradeFeature':
      return {
        title: 'Takas Özelliği',
        message: 'Takas tekliflerinde bulunmak için Premium üyeliğe geçin.',
      };
    case 'collectionFeature':
      return {
        title: 'Dijital Garaj',
        message: 'Koleksiyonlarınızı sergilemek için Premium üyeliğe geçin.',
      };
    case 'featureListing':
      return {
        title: 'Öne Çıkarılan İlanlar',
        message: 'İlanlarınızı öne çıkarmak için Premium üyeliğe geçin.',
      };
    case 'messageLimit':
      return {
        title: 'Günlük Mesaj Limiti',
        message: 'Sınırsız mesaj göndermek için Premium üyeliğe geçin.',
      };
    case 'addressLimit':
      return {
        title: 'Adres Limiti',
        message: 'Daha fazla adres kaydetmek için Premium üyeliğe geçin.',
      };
    case 'savedSearchLimit':
      return {
        title: 'Kayıtlı Arama Limiti',
        message: 'Sınırsız arama kaydetmek için Premium üyeliğe geçin.',
      };
    case 'imageLimit':
      return {
        title: 'Resim Limiti',
        message: 'Daha fazla resim yüklemek için Premium üyeliğe geçin.',
      };
    case 'valueLimit':
      return {
        title: 'Fiyat Limiti',
        message: 'Daha yüksek değerli ilanlar vermek için Premium üyeliğe geçin.',
      };
    default:
      return {
        title: 'Premium Özellik',
        message: 'Bu özelliği kullanmak için Premium üyeliğe geçin.',
      };
  }
};

// Check verification criteria for free members
export interface VerificationCriteria {
  emailVerified: boolean;
  phoneVerified: boolean;
  hasTransaction: boolean;
  accountAgeOk: boolean;
  noDisputes: boolean;
  profileComplete: boolean;
  allMet: boolean;
}

export const getVerificationCriteria = (): VerificationCriteria => {
  const { user } = useAuthStore.getState();
  
  if (!user) {
    return {
      emailVerified: false,
      phoneVerified: false,
      hasTransaction: false,
      accountAgeOk: false,
      noDisputes: false,
      profileComplete: false,
      allMet: false,
    };
  }
  
  const emailVerified = user.isEmailVerified;
  const phoneVerified = user.isPhoneVerified;
  const hasTransaction = user.totalSales > 0 || user.totalPurchases > 0;
  const accountAgeOk = user.accountAge >= 30;
  const noDisputes = user.disputeCount === 0;
  const profileComplete = user.profileCompletion >= 80;
  
  return {
    emailVerified,
    phoneVerified,
    hasTransaction,
    accountAgeOk,
    noDisputes,
    profileComplete,
    allMet: emailVerified && phoneVerified && hasTransaction && accountAgeOk && noDisputes && profileComplete,
  };
};

// Get tier display info
export const getTierDisplayInfo = (tier: MembershipTier): { name: string; color: string; icon: string } => {
  switch (tier) {
    case 'free':
      return { name: 'Ücretsiz Üye', color: '#757575', icon: 'account' };
    case 'basic':
      return { name: 'Temel Üye', color: '#1976D2', icon: 'account-check' };
    case 'premium':
      return { name: 'Premium Üye', color: '#FF6B35', icon: 'crown' };
    case 'business':
      return { name: 'Kurumsal', color: '#9C27B0', icon: 'domain' };
    default:
      return { name: 'Üye', color: '#757575', icon: 'account' };
  }
};

// Format limit value for display
export const formatLimit = (value: number): string => {
  if (value === -1) return 'Sınırsız';
  return value.toString();
};

// Check if user should see upgrade prompt after certain actions
export const shouldShowUpgradePrompt = (
  triggerType: 'listingLimitReached' | 'after5Sales' | 'tryCreateCollection' | 'messageLimitReached'
): boolean => {
  const { user, limits } = useAuthStore.getState();
  
  if (!user || !limits) return false;
  
  switch (triggerType) {
    case 'listingLimitReached':
      return limits.maxListings !== -1 && user.listingCount >= limits.maxListings;
    
    case 'after5Sales':
      return user.totalSales >= 5 && !limits.canTrade;
    
    case 'tryCreateCollection':
      return !limits.canCreateCollections;
    
    case 'messageLimitReached':
      // This would need daily message count tracking
      return false;
    
    default:
      return false;
  }
};

// Get remaining count for a limit
export const getRemainingCount = (
  limitType: 'listings' | 'addresses' | 'savedSearches' | 'images'
): number => {
  const { user, limits } = useAuthStore.getState();
  
  if (!user || !limits) return 0;
  
  switch (limitType) {
    case 'listings':
      if (limits.maxListings === -1) return -1;
      return Math.max(0, limits.maxListings - user.listingCount);
    
    case 'addresses':
      // Would need address count from API
      return limits.maxAddresses;
    
    case 'savedSearches':
      // Would need saved search count from API
      return limits.maxSavedSearches;
    
    case 'images':
      return limits.maxImagesPerListing;
    
    default:
      return 0;
  }
};

export default {
  canPerformAction,
  getUpgradePrompt,
  getUpgradeMessage,
  getVerificationCriteria,
  getTierDisplayInfo,
  formatLimit,
  shouldShowUpgradePrompt,
  getRemainingCount,
  FREE_MEMBER_LIMITS,
  PREMIUM_MEMBER_LIMITS,
};
