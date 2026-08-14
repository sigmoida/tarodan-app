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
  /** İnsan-okunur ilan numarası (U010001) — kalıcı, destek/şikayet referansı. */
  productCode?: string | null;
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
  modelCode?: string | null;
  color?: string | null;
  isBoxed?: boolean | null;
  year?: number;
  condition?: string;
  /** Niyet VE yetki: satıcının üyeliği takasa uygunsa true (API türetir). */
  tradeAvailable?: boolean;
  /** @deprecated eski alan — `tradeAvailable` kullanın. */
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
    publicName?: string;
    displayName?: string;
    username?: string | null;
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
    /** Grubun GÖRÜNEN adı ("Ölçek", "Malzeme", "Renk"). */
    group: string;
    /** Grubun slug'ı ("scale", "material", "color") — dile bağlı değildir. */
    groupSlug?: string;
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
