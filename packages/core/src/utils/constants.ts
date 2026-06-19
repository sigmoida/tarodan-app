// API URLs
export const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:3001';

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// File uploads
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];
export const MAX_PRODUCT_IMAGES = 10;

// Product
export const MIN_PRODUCT_PRICE = 1;
export const MAX_PRODUCT_PRICE = 1000000;
export const MIN_PRODUCT_TITLE_LENGTH = 5;
export const MAX_PRODUCT_TITLE_LENGTH = 100;
export const MAX_PRODUCT_DESCRIPTION_LENGTH = 5000;

// Offers
export const MIN_OFFER_PERCENTAGE = 50; // Minimum 50% of original price
export const OFFER_EXPIRY_DAYS = 7;

// Orders
export const ORDER_STATUSES = {
  PENDING: { label: 'Bekliyor', color: 'yellow' },
  PAYMENT_PENDING: { label: 'Ödeme Bekleniyor', color: 'orange' },
  PAID: { label: 'Ödendi', color: 'blue' },
  PROCESSING: { label: 'Hazırlanıyor', color: 'blue' },
  SHIPPED: { label: 'Kargoda', color: 'purple' },
  DELIVERED: { label: 'Teslim Edildi', color: 'green' },
  COMPLETED: { label: 'Tamamlandı', color: 'green' },
  CANCELLED: { label: 'İptal', color: 'red' },
  REFUNDED: { label: 'İade Edildi', color: 'gray' },
  DISPUTED: { label: 'İhtilaflı', color: 'red' },
} as const;

// Product conditions
export const PRODUCT_CONDITIONS = {
  NEW: { label: 'Sıfır', description: 'Hiç kullanılmamış, orijinal ambalajında' },
  LIKE_NEW: { label: 'Sıfır Gibi', description: 'Çok az kullanılmış, kusursuz' },
  GOOD: { label: 'İyi', description: 'Normal kullanım izleri var' },
  FAIR: { label: 'Orta', description: 'Belirgin kullanım izleri var' },
  POOR: { label: 'Kötü', description: 'Hasar veya aşırı kullanım izleri var' },
} as const;

// Membership tiers
export const MEMBERSHIP_TIERS = {
  FREE: { label: 'Ücretsiz', maxListings: 5, commissionRate: 10 },
  BASIC: { label: 'Basic', maxListings: 25, commissionRate: 8 },
  PREMIUM: { label: 'Premium', maxListings: 100, commissionRate: 6 },
  BUSINESS: { label: 'Business', maxListings: -1, commissionRate: 4 }, // -1 = unlimited
} as const;

// Shipping carriers — platform tek kargo (Sürat) ile çalışır
export const SHIPPING_CARRIERS = {
  SURAT: { name: 'Sürat Kargo', trackingUrl: 'https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=' },
} as const;
