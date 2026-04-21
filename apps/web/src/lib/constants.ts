/**
 * Product Status Enum and Labels
 */
export type ProductStatus = 
  | 'draft'
  | 'pending'
  | 'active'
  | 'reserved'
  | 'sold'
  | 'inactive'
  | 'rejected';

export const ProductStatusLabels: Record<ProductStatus, string> = {
  draft: 'Taslak',
  pending: 'Onay Bekliyor',
  active: 'Yayında',
  reserved: 'Rezerve',
  sold: 'Satıldı',
  inactive: 'Pasif',
  rejected: 'Reddedildi',
};

export const ProductStatusColors: Record<ProductStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-warning-100 text-warning-800',
  active: 'bg-success-100 text-success-800',
  reserved: 'bg-info-100 text-info-800',
  sold: 'bg-primary-100 text-primary-800',
  inactive: 'bg-gray-100 text-gray-600',
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
