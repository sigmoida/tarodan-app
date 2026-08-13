/**
 * Canonical product/listing shape returned by the `/products/*` API, consumed by
 * the shared `ProductCard` and the listing query hooks. Replaces the per-file
 * `Product`/`Listing` interfaces that were redeclared across home, listings,
 * category, favorites, seller, etc. (The old `types/index.ts#Listing` is stale —
 * number ids, string images — don't use it for product cards.)
 */

export interface ProductImage {
  id?: string;
  url?: string;
  cardUrl?: string;
  detailUrl?: string;
  sortOrder?: number;
}

export interface ProductBrandRef {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
}

/** Flattened attribute entry (e.g. groupSlug 'hw-rarity', slug 'treasure-hunt'). */
export interface ProductAttributeEntry {
  slug?: string;
  groupSlug?: string;
}

export interface Product {
  id: string | number;
  title: string;
  description?: string;
  price: number;
  originalPrice?: number | null;
  oldPrice?: number | null;
  salePrice?: number | null;
  saleStartDate?: string | null;
  saleEndDate?: string | null;
  /**
   * Bu ürün için geçerli, herkese açık BEDEL kampanyalarının adları
   * ("Komisyonsuz alışveriş" gibi). Fiyatı değiştirmedikleri için vitrinde
   * yalnız rozet olarak görünürler.
   */
  feeCampaigns?: string[];
  discountPercent?: number | null;
  isOnSale?: boolean;
  isBoosted?: boolean;
  /** 'active' = in stock; any other status counts as out of stock. */
  status?: string | null;
  /** quantity - reserved. null = unlimited stock; <= 0 = out of stock. */
  availableQuantity?: number | null;
  images?: ProductImage[] | string[];
  brand?: ProductBrandRef | string;
  scale?: string;
  year?: number | string;
  condition?: string;
  /** Niyet VE yetki: satıcının üyeliği takasa uygunsa true (API türetir). */
  tradeAvailable?: boolean;
  /** @deprecated eski alan — `tradeAvailable` kullanın. */
  trade_available?: boolean;
  isTradeEnabled?: boolean;
  isPreorder?: boolean;
  isLimited?: boolean;
  editionNumber?: number | string | null;
  rating?: { average: number | null; count: number };
  viewCount?: number;
  likeCount?: number;
  seller?: {
    id: string | number;
    /** Herkese açık ad (API çözer): firma adı → kullanıcı adı → isim. */
    publicName?: string;
    /** Uyumluluk takma adı — publicName ile aynı değer. */
    displayName?: string;
    username?: string | null;
    rating?: number;
  };
  attributes?: ProductAttributeEntry[];
}
