/** Common diecast scales — fallback when the API returns none (shared by the
 *  header nav scale dropdown and the listings sidebar). */
export const SCALE_FALLBACK = ['1:18', '1:24', '1:43', '1:64', '1:87'];

/**
 * Product Status Enum and Labels
 */
export type ProductStatus =
  | 'pending'
  | 'active'
  | 'reserved'
  | 'sold'
  | 'inactive'
  | 'rejected';

export const ProductStatusLabels: Record<ProductStatus, string> = {
  pending: 'Onay Bekliyor',
  active: 'Yayında',
  reserved: 'Rezerve',
  sold: 'Satıldı',
  inactive: 'Pasif',
  rejected: 'Reddedildi',
};

export const ProductStatusColors: Record<ProductStatus, string> = {
  pending: 'bg-warning-100 text-warning-800',
  active: 'bg-success-100 text-success-800',
  reserved: 'bg-info-100 text-info-800',
  sold: 'bg-primary-100 text-primary-800',
  inactive: 'bg-surface-alt text-muted',
  rejected: 'bg-danger-100 text-danger-800',
};

/**
 * Product Condition Enum and Labels
 */
export type ProductCondition = 
  | 'new'
  | 'like_new'
  | 'very_good'
  | 'good'
  | 'fair';

export const ProductConditionLabels: Record<ProductCondition, string> = {
  new: 'Sıfır',
  like_new: 'Sıfır Gibi',
  very_good: 'Çok İyi',
  good: 'İyi',
  fair: 'Orta',
};

/**
 * Membership Tier Types and Labels
 */
export type MembershipTier = 'free' | 'premium' | 'business';

export const MembershipTierLabels: Record<MembershipTier, string> = {
  free: 'Ücretsiz',
  premium: 'Premium',
  business: 'İş',
};

/**
 * Order Status Enum and Labels
 */
export type OrderStatus = 
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunded';

export const OrderStatusLabels: Record<OrderStatus, string> = {
  pending: 'Beklemede',
  paid: 'Ödendi',
  processing: 'İşleniyor',
  shipped: 'Kargoya Verildi',
  delivered: 'Teslim Edildi',
  completed: 'Tamamlandı',
  cancelled: 'İptal Edildi',
  refunded: 'İade Edildi',
};

/**
 * Free shipping threshold (in TL)
 */
export const FREE_SHIPPING_THRESHOLD = 500;

/**
 * Platform settings
 */
export const PLATFORM_SETTINGS = {
  freeShippingThreshold: 500,
  maxImagesPerProduct: 10,
  maxProductsInCart: 10,
  commissionRate: 0.05, // 5%
};
