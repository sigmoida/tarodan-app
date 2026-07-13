/**
 * Merkezi query key registry — TanStack Query anahtarlarının TEK kaynağı.
 *
 * Neden: 189 inline useQuery ekranlar arası anahtarları elle yazıyordu
 * (`['my-collections']` vs `['myCollections']`, `['collections']` vs
 * `['collection', id]` gibi sessiz drift'ler). Merkezî factory ile:
 *   - anahtarlar tutarlı ve tip-güvenli üretilir,
 *   - mutation hook'ları `invalidateQueries({ queryKey: qk.products.all })`
 *     ile bir domain'in tüm alt-anahtarlarını hiyerarşik geçersiz kılar.
 *
 * Konvansiyon (web `lib/queryClient` ergonomisinin mobil karşılığı):
 *   qk.<domain>.all                 → domain kökü (liste invalidasyonu için)
 *   qk.<domain>.list(filters?)      → filtreli/aramalı liste
 *   qk.<domain>.detail(id)          → tekil kayıt
 *
 * Yeni domain eklerken: aşağıya bir factory nesnesi ekle, `as const` bırak.
 * Ekranlar Faz 1'de inline anahtarlarını bu registry'ye bağlar.
 */

type Filters = Record<string, unknown> | undefined;

export const qk = {
  products: {
    all: ['products'] as const,
    list: (filters?: Filters) => ['products', 'list', filters] as const,
    search: (query?: string, filters?: Filters) =>
      ['products-search', query, filters] as const,
    detail: (id: string) => ['product', id] as const,
    reviews: (id: string) => ['product-reviews', id] as const,
    /** Liste ekranlarının (home/arama/öne-çıkanlar) prefix root'ları — beğeni/
     * görüntülenme değişince hepsi tazelensin diye tek yerde. */
    searchAll: ['products-search'] as const,
    boosted: ['products', 'boosted'] as const,
    featuredBusiness: ['featured-business'] as const,
    featuredCollector: ['featured-collector'] as const,
    myListings: (filters?: Filters | string) => ['my-listings', filters] as const,
    myListingsStats: ['my-listings-stats'] as const,
    myFeatured: ['my-featured-listings'] as const,
    listings: (filters?: Filters) => ['listings', filters] as const,
    /** Prefix roots for invalidation (match every filtered variant). */
    listingsAll: ['listings'] as const,
    myListingsAll: ['my-listings'] as const,
  },

  catalog: {
    categories: ['categories'] as const,
    brands: ['brands'] as const,
    manufacturers: ['manufacturers'] as const,
    carModels: (filters?: Filters) => ['car-models', filters] as const,
    pages: (slug?: string) => ['pages', slug] as const,
  },

  collections: {
    all: ['collections'] as const,
    list: (filters?: Filters) => ['collections', 'list', filters] as const,
    detail: (id: string) => ['collection', id] as const,
    browse: ['collections', 'browse'] as const,
    mine: ['my-collections'] as const,
    liked: ['liked-collections'] as const,
    picker: ['collection-picker'] as const,
    profile: (userId: string) => ['profile-collections', userId] as const,
  },

  orders: {
    all: ['orders'] as const,
    list: (filters?: Filters) => ['orders', 'list', filters] as const,
    detail: (id: string) => ['order', id] as const,
    elogoInvoice: (id: string) => ['elogo-invoice', id] as const,
    sellerInvoice: (id: string) => ['seller-invoice', id] as const,
    sellerPending: ['seller-pending-orders'] as const,
  },

  trades: {
    all: ['trades'] as const,
    list: (filters?: Filters) => ['trades', 'list', filters] as const,
    detail: (id: string) => ['trade', id] as const,
    statusCounts: ['trades-status-counts'] as const,
    targetListing: (id: string) => ['trade-target-listing', id] as const,
    myTradeable: ['my-tradeable-products'] as const,
    sellerTradeable: (sellerId: string) =>
      ['seller-tradeable-products', sellerId] as const,
  },

  offers: {
    all: ['offers'] as const,
    list: (type?: string) => ['offers', 'list', type] as const,
    detail: (id: string) => ['offer', id] as const,
    /** Batch komisyon önizlemesi — teklif id kümesine göre anahtarlı. */
    commissionPreview: (ids: string[]) =>
      ['offers', 'commission-preview', ids] as const,
  },

  membership: {
    all: ['membership'] as const,
    me: ['membership-me'] as const,
    discounts: ['my-discounts'] as const,
    discountProducts: ['my-products-for-discount'] as const,
    eligibleForFeatured: ['eligible-for-featured'] as const,
  },

  payments: {
    mine: ['my-payments'] as const,
    savedCards: ['saved-cards'] as const,
  },

  user: {
    detail: (id: string) => ['user', id] as const,
    stats: (id?: string) => ['user-stats', id] as const,
    /** Prefix root — invalidate every user-stats variant (with/without id). */
    statsAll: ['user-stats'] as const,
    trust: ['me-trust'] as const,
    bankAccount: ['bank-account'] as const,
    addresses: ['addresses'] as const,
    notificationSettings: ['notification-settings'] as const,
    savedSearches: ['saved-searches'] as const,
  },

  seller: {
    detail: (id: string) => ['seller', id] as const,
    stats: (id: string) => ['seller-stats', id] as const,
    products: (id: string) => ['seller-products', id] as const,
    ratings: (id: string) => ['seller-ratings', id] as const,
    ratingStats: (id: string) => ['seller-rating-stats', id] as const,
    collections: (id: string) => ['seller-collections', id] as const,
  },

  notifications: {
    unread: ['notifications-unread'] as const,
  },

  favorites: {
    all: ['favorites'] as const,
  },

  follow: {
    following: ['following'] as const,
  },

  subscription: {
    current: ['subscription-current'] as const,
    billing: ['billing-history'] as const,
  },

  addresses: {
    mine: ['my-addresses'] as const,
  },

  checkout: {
    quote: (sig: string) => ['checkout-quote', sig] as const,
  },

  support: {
    tickets: ['support-tickets'] as const,
  },

  refunds: {
    requests: (filters?: Filters) => ['refund-requests', filters] as const,
  },

  featured: {
    business: ['featured-business'] as const,
    collector: ['featured-collector'] as const,
  },
} as const;
