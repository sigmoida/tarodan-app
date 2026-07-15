/** @format */

export interface RecentSale {
  id: string;
  productTitle: string;
  productImage?: string;
  buyerName: string;
  amount: number;
  soldAt: string;
  orderId?: string;
}

export interface UserStats {
  productsCount: number;
  activeProductsCount: number;
  soldProductsCount: number;
  ordersCount: number;
  completedOrdersCount: number;
  purchasesCount: number;
  salesCount: number;
  tradesCount: number;
  successfulTradesCount: number;
  collectionsCount: number;
  totalViews: number;
  totalFavorites: number;
  rating: number;
  reviewsCount: number;
  totalRevenue: number;
  totalSpent: number;
  memberSince: string;
  membershipTier: string;
}

const PAID_STATUSES = [
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "awaiting_buyer_confirmation",
  "completed",
];

/** Fallback aggregation from the raw product/order/trade/collection lists. */
export function aggregateStats(
  products: any[],
  orders: any[],
  trades: any[],
  collections: any[],
  profile: any,
  user: any,
): UserStats {
  const activeProducts = products.filter((p) => p.status === "active");
  const soldProducts = products.filter((p) => p.status === "sold");
  const totalViews = products.reduce((sum, p) => sum + (p.viewCount || 0), 0);
  const totalFavorites = products.reduce(
    (sum, p) => sum + (p.likeCount || 0),
    0,
  );
  const totalRevenue = soldProducts.reduce(
    (sum, p) => sum + (parseFloat(p.price) || 0),
    0,
  );
  const completedOrders = orders.filter((o) =>
    ["delivered", "completed"].includes(o.status),
  );
  const paidOrders = orders.filter((o) => PAID_STATUSES.includes(o.status));
  const totalSpent = paidOrders.reduce(
    (sum, o) => sum + (parseFloat(o.totalAmount ?? o.total) || 0),
    0,
  );
  const successfulTrades = trades.filter((tr) => tr.status === "completed");

  return {
    productsCount: products.length,
    activeProductsCount: activeProducts.length,
    soldProductsCount: soldProducts.length,
    ordersCount: orders.length,
    completedOrdersCount: completedOrders.length,
    purchasesCount: paidOrders.length,
    salesCount: soldProducts.length,
    tradesCount: trades.length,
    successfulTradesCount: successfulTrades.length,
    collectionsCount: collections.length,
    totalViews,
    totalFavorites,
    rating: profile?.stats?.averageRating ?? profile?.rating ?? 0,
    reviewsCount: profile?.stats?.totalRatings ?? profile?.reviewsCount ?? 0,
    totalRevenue,
    totalSpent,
    memberSince:
      profile?.createdAt || user?.createdAt || new Date().toISOString(),
    membershipTier: profile?.membershipTier || user?.membershipTier || "free",
  };
}

export function emptyStats(user: any): UserStats {
  const memberSince = user?.createdAt
    ? typeof user.createdAt === "string"
      ? user.createdAt
      : new Date(user.createdAt).toISOString()
    : new Date().toISOString();
  return {
    productsCount: 0,
    activeProductsCount: 0,
    soldProductsCount: 0,
    ordersCount: 0,
    completedOrdersCount: 0,
    purchasesCount: 0,
    salesCount: 0,
    tradesCount: 0,
    successfulTradesCount: 0,
    collectionsCount: 0,
    totalViews: 0,
    totalFavorites: 0,
    rating: 0,
    reviewsCount: 0,
    totalRevenue: 0,
    totalSpent: 0,
    memberSince,
    membershipTier: user?.membershipTier || "free",
  };
}

export function mapRecentSales(orders: any[], userId?: string): RecentSale[] {
  return orders
    .filter((o) => o.isSeller || o.sellerId === userId)
    .slice(0, 10)
    .map((o) => ({
      id: o.id,
      productTitle: o.product?.title || o.items?.[0]?.product?.title || "Ürün",
      productImage: o.product?.imageUrl || o.items?.[0]?.product?.imageUrl,
      buyerName: o.buyer?.displayName || "Alıcı",
      amount: parseFloat(o.totalAmount || o.amount || o.total || "0"),
      soldAt: o.createdAt,
      orderId: o.id,
    }));
}

/** Membership age in days + whole months. */
export function membershipDuration(memberSince: string): {
  days: number;
  months: number;
} {
  const date = memberSince ? new Date(memberSince) : new Date();
  const days = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  return { days, months: Math.floor(days / 30) };
}
