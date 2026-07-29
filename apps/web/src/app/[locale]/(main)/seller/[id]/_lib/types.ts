/** @format */

export interface UserRating {
  id: string;
  score: number;
  comment?: string;
  giverName?: string;
  createdAt: string;
  giver?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export interface RatingStats {
  totalRatings: number;
  averageScore: number;
  scoreDistribution?: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface SellerStats {
  totalListings: number;
  totalSales: number;
  totalTrades: number;
  averageRating: number;
  totalRatings: number;
}

export interface Seller {
  id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
  isVerified: boolean;
  isPremium?: boolean;
  trustScore?: number;
  trustLevel?: string;
  sellerType?: string;
  followersCount?: number;
  storeViewCount?: number;
  stats?: SellerStats;
}

export interface SellerCollection {
  id: string;
  name: string;
  coverImageUrl?: string;
  itemCount?: number;
  viewCount?: number;
  likeCount?: number;
}

export type SellerTab = "listings" | "reviews" | "collections";
