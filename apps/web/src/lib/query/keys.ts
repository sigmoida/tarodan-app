/**
 * Central query-key registry. The whole point is that the **server prefetch**
 * and the **client `useQuery`** for a given resource use the exact same key, so
 * the dehydrated cache hydrates in place (no refetch flash). Never hand-write a
 * key array at a call site — go through here. Values mirror the keys already used
 * across the app so existing caches stay compatible.
 */
export const queryKeys = {
  product: {
    detail: (id: string | number) => ["listing", String(id)] as const,
    similar: (id: string | number) =>
      ["listing", String(id), "similar"] as const,
    reviews: (
      id: string | number,
      sortBy: string,
      filterScore: number | null,
    ) => ["listing-reviews", String(id), sortBy, filterScore] as const,
  },
  listings: {
    /**
     * The listings grid key. `filters` is the parsed `Filters` snapshot,
     * `categoryId` is the resolved category id (slug→id or explicit), and
     * `page` is the 1-based page. Used identically by the server seed and the
     * client `useQuery` so the dehydrated cache hydrates without a refetch.
     */
    list: <TFilters>(
      filters: TFilters,
      categoryId: string | undefined,
      page: number,
    ) => ["listings", filters, categoryId ?? "", page] as const,
    /** The listings filter facets (scales, brands, materials, …). */
    filters: () => ["listings", "filters"] as const,
  },
  home: {
    featured: () => ["home", "featured"] as const,
    discounted: () => ["home", "discounted"] as const,
    trade: () => ["home", "trade"] as const,
    popular: () => ["home", "bestSellers", "popular"] as const,
    topCollections: (limit: number) =>
      ["home", "topCollections", { limit }] as const,
    featuredCollector: () => ["home", "featuredCollector"] as const,
    featuredBusiness: () => ["home", "featuredBusiness"] as const,
    manufacturers: () => ["home", "manufacturers"] as const,
  },
  collections: {
    /**
     * Public collections grid key. `search`/`categoryId` are the already-trimmed
     * values; empty strings normalize to `null` so the server seed and the
     * client's first-render `useQuery` produce identical keys.
     */
    public: (sortBy: string, search: string, categoryId: string) =>
      [
        "collections",
        "public",
        sortBy,
        search || null,
        categoryId || null,
      ] as const,
    mine: () => ["collections", "mine"] as const,
  },
  manufacturers: {
    /** The public manufacturers list — seeded by the server, read by the client. */
    list: () => ["manufacturers", "list"] as const,
    /** A single manufacturer resolved by slug. */
    detail: (slug: string) => ["manufacturers", "detail", slug] as const,
    /** Active listings for a manufacturer's detail grid. */
    products: (slug: string) => ["manufacturers", "products", slug] as const,
    /** The 4-item listings teaser inside an accordion card (keyed by id). */
    preview: (id: string) => ["manufacturers", "preview", id] as const,
    /** Manufacturer-scoped custom attribute filter groups (e.g. Hot Wheels). */
    customAttrs: (slug: string) =>
      ["manufacturers", "custom-attrs", slug] as const,
  },
  category: {
    bySlug: (slug: string) => ["categoryBySlug", slug] as const,
  },
  categories: {
    all: () => ["categories", "all"] as const,
    collections: () => ["categories", "collections"] as const,
  },
  wishlist: {
    check: (id: string | number) => ["wishlist-check", String(id)] as const,
  },
  profile: {
    /** The profile overview aggregate (stats + membership + pending counts). */
    overview: () => ["profile", "overview"] as const,
    unreadMessages: () => ["profile-unread-messages"] as const,
  },
  membership: {
    /** All membership tiers with their prices (single source: DB MembershipTier). */
    tiers: () => ["membership", "tiers"] as const,
    /** The current user's membership (tier + status + period). */
    me: () => ["membership", "me"] as const,
  },
} as const;

/**
 * Resource-prefixed key factory — the web analogue of admin's `adminKeys`. Use it
 * for account-area CRUD resources (addresses, discounts, support tickets, …) via
 * the shared `useWebList` / `useWebItem` / `useWebMutation` hooks. Every key starts
 * with the resource name, so ONE `invalidateQueries({ queryKey: [resource] })`
 * refreshes all of a resource's lists + details. The bespoke `queryKeys` above
 * stay for the SSR-prefetched public routes (their keys must match the seed).
 *
 *   list:   [resource, 'list', params?]
 *   detail: [resource, 'detail', id]
 */
export const webKeys = {
  all: (resource: string) => [resource] as const,
  list: (resource: string, params?: unknown) =>
    params === undefined
      ? ([resource, "list"] as const)
      : ([resource, "list", params] as const),
  detail: (resource: string, id: string) => [resource, "detail", id] as const,
};
