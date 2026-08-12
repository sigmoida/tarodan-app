export enum UserRole {
  USER = "USER",
  SELLER = "SELLER",
  ADMIN = "ADMIN",
}

export enum MembershipTier {
  FREE = "FREE",
  BASIC = "BASIC",
  PREMIUM = "PREMIUM",
  BUSINESS = "BUSINESS",
}

/**
 * Bir üyenin BAŞKA üyelere görünen kimliği. Zincir (firma adı → kullanıcı adı
 * → isim) SUNUCUDA çözülür; istemci hazır `publicName` alanını basar.
 * Gerçek ad yalnız kişinin kendi yüzeylerinde (profil ayarları, fatura,
 * kargo etiketi) görünür.
 */
export interface PublicIdentity {
  id: string;
  /** Herkese açık ad. */
  publicName: string;
  /** Uyumluluk takma adı — `publicName` ile aynı değeri taşır. */
  displayName: string;
  /** Profil bağlantısı için kullanıcı adı; seçilmemişse null. */
  username: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  role: UserRole;
  membershipTier: MembershipTier;
  isVerified: boolean;
  isPhoneVerified?: boolean;
  isSeller: boolean;
  rating?: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile extends User {
  bio?: string;
  location?: string;
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
  };
  stats: {
    totalSales: number;
    totalPurchases: number;
    totalTrades: number;
    activeListings: number;
  };
}

export interface Address {
  id: string;
  userId: string;
  title: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  district: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface CreateUserDto {
  email: string;
  password: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
}

export interface UpdateUserDto {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
