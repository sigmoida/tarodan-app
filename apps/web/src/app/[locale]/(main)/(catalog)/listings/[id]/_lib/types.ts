/** @format */

export interface ProductImage {
  id?: string;
  url?: string;
  cardUrl?: string;
  detailUrl?: string;
  sortOrder?: number;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  oldPrice?: number | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  discountPercent?: number | null;
  images: Array<ProductImage | string>;
  brand?: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
  };
  manufacturer?: {
    id: string;
    name: string;
    slug: string;
  };
  scale?: string;
  material?: string;
  year?: number;
  condition?: string;
  trade_available?: boolean;
  isTradeEnabled?: boolean;
  quantity?: number | null;
  /** Müsait adet (quantity - reserved); teklif/takas rezervasyonu düşülmüş stok */
  availableQuantity?: number | null;
  status?:
    | "pending"
    | "active"
    | "reserved"
    | "sold"
    | "inactive"
    | "rejected"
    | "deleted";
  sellerId?: string;
  seller?: {
    id: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    rating?: number;
    listings_count?: number;
    productsCount?: number;
    created_at?: string;
  };
  category?: {
    id: string;
    name: string;
  };
  created_at?: string;
  createdAt?: string;
  viewCount?: number;
  likeCount?: number;
  attributes?: Array<{
    id: string;
    name: string;
    label: string;
    value: string;
    group: string;
  }>;
  carModel?: {
    id: string;
    name: string;
    slug: string;
    brandSlug?: string;
  };
}

export interface ReviewStats {
  averageRating: number;
  totalRatings: number;
  scoreDistribution?: Record<number, number>;
}
