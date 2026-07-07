export enum UserRole {
  USER = 'USER',
  SELLER = 'SELLER',
  ADMIN = 'ADMIN',
}

export enum MembershipTier {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
  BUSINESS = 'BUSINESS',
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
