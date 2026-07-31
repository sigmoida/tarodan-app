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
  /** Coupon amount validated by the same server quote used for payment. */
  couponDiscount?: number;
  pricing: {
    subtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    /** Etkin oran (%) — etikette gösterilir; sabit değil, kural setinden gelir. */
    buyerFeeRate: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    taxAmount: number;
    /** Alıcıdan tahsil edilen hizmet KDV'si (komisyon + kargo payı + hizmet bedeli). */
    buyerServiceTaxAmount: number;
    /** Uygulanan hizmet KDV oranı (%) — satır bazında KDV bunun üzerinden türetilir. */
    serviceVatRate: number;
    totalAmount: number;
    sellerNetAmount: number;
  };
  /** Active shipping-tariff version this quote was priced with (sent back on submit). */
  shippingTariffVersion?: number | null;
  /** Unit-price hash this quote was priced with; sent back on submit → 409 if a price/campaign moved. */
  pricingHash?: string;
}
