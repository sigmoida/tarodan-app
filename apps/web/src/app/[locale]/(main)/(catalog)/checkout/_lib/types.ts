/** @format */

export interface Address {
  id: string;
  title?: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
  isDefault?: boolean;
}

export interface CheckoutItem {
  id: string;
  productId: string;
  title: string;
  price: number;
  /** Üstü çizili eski fiyat (satıcı indirimi varsa) */
  originalPrice?: number;
  /** Satın alınacak adet (sepet satırından veya "Hemen Al" adet seçiminden). */
  quantity: number;
  /** Adet tavanı (mevcut stok ∧ sipariş-cap'i); yoksa üst sınır uygulanmaz. */
  maxQuantity?: number;
  imageUrl: string;
  seller: {
    id: string;
    displayName: string;
  };
}

export interface CheckoutQuote {
  pricing: {
    subtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    taxAmount: number;
    totalAmount: number;
    sellerNetAmount: number;
  };
  /** Active shipping-tariff version this quote was priced with (sent back on submit). */
  shippingTariffVersion?: number | null;
}
