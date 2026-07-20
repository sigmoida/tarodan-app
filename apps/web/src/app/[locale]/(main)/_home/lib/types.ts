// `Product` is the canonical `@/types/product` shape — the home rails feed it
// straight into the shared `ProductCard`. Import it from there, not here.

import type { Product } from "@/types/product";

export interface BrandMarqueeItem {
  name: string;
  logoUrl: string;
  desc: string;
}

export interface FeaturedCollector {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
    isVerified?: boolean;
  };
  items: Array<{
    id: string;
    productId: string;
    productTitle: string;
    productPrice: number;
    productImage?: string;
  }>;
}

export interface FeaturedBusiness {
  id: string;
  displayName: string;
  companyName?: string;
  avatarUrl?: string;
  bio?: string;
  isVerified: boolean;
  stats: {
    totalProducts: number;
    totalViews: number;
    totalLikes: number;
    totalSales: number;
    averageRating: number;
    totalRatings: number;
  };
  collections: Array<{
    id: string;
    name: string;
    viewCount: number;
    likeCount: number;
    coverImageUrl?: string;
    itemCount: number;
    previewItems: Array<{
      id: string;
      productTitle: string;
      productPrice: number;
      productImage?: string;
    }>;
  }>;
  products: Array<{
    id: string;
    title: string;
    price: number;
    viewCount: number;
    likeCount: number;
    image?: string;
  }>;
}

export interface HomePageData {
  featured: Product[];
  discounted: Product[];
  trade: Product[];
  popular: Product[];
  topCollections: FeaturedCollector[];
  featuredCollector: FeaturedCollector | null;
  featuredBusiness: FeaturedBusiness | null;
  marqueeItems: BrandMarqueeItem[];
}
