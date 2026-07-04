export interface Product {
  id: string;
  title: string;
  price: number;
  oldPrice?: number | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  discountPercent?: number | null;
  images?:
    | Array<{
        id?: string;
        url?: string;
        cardUrl?: string;
        detailUrl?: string;
        sortOrder?: number;
      }>
    | string[];
  brand?: string;
  scale?: string;
  isTradeEnabled?: boolean;
  trade_available?: boolean;
  isBoosted?: boolean;
  viewCount: number;
  likeCount: number;
  createdAt?: string;
  condition?: string;
  isPreorder?: boolean;
  isLimited?: boolean;
  editionNumber?: string;
  rating?: { average: number | null; count: number };
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
