import type { PublicIdentity } from "./user";

import { Address } from "./user";

export enum OrderStatus {
  PENDING = "PENDING",
  PAYMENT_PENDING = "PAYMENT_PENDING",
  PAID = "PAID",
  PROCESSING = "PROCESSING",
  SHIPPED = "SHIPPED",
  DELIVERED = "DELIVERED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
  DISPUTED = "DISPUTED",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
  CANCELLED = "CANCELLED",
}

export enum PaymentMethod {
  CREDIT_CARD = "CREDIT_CARD",
  BANK_TRANSFER = "BANK_TRANSFER",
  WALLET = "WALLET",
}

export interface Order {
  id: string;
  orderNumber: string;
  buyerId?: string;
  sellerId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  shippingCost: number;
  commissionAmount: number;
  status: OrderStatus;
  shippingAddress: Address;
  guestEmail?: string;
  guestPhone?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderWithDetails extends Order {
  // E-posta karşı tarafa AÇILMAZ; bildirim adresi sunucuda kalır.
  buyer?: PublicIdentity;
  seller: PublicIdentity;
  product: {
    id: string;
    name: string;
    images: string[];
  };
  payment?: Payment;
  shipment?: Shipment;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  paymentDetails?: Record<string, any>;
  paidAt?: Date;
  createdAt: Date;
}

export interface Shipment {
  id: string;
  orderId: string;
  carrier: string;
  trackingNumber?: string;
  status: ShipmentStatus;
  shippedAt?: Date;
  deliveredAt?: Date;
  estimatedDelivery?: Date;
  createdAt: Date;
}

export enum ShipmentStatus {
  PENDING = "PENDING",
  LABEL_CREATED = "LABEL_CREATED",
  PICKED_UP = "PICKED_UP",
  IN_TRANSIT = "IN_TRANSIT",
  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
  RETURNED = "RETURNED",
}

export interface CreateOrderDto {
  productId: string;
  quantity: number;
  shippingAddressId: string;
  notes?: string;
}

export interface GuestCheckoutDto {
  productId: string;
  quantity?: number;
  email: string;
  phone: string;
  guestName?: string;
  emailVerificationCode: string;
  shippingAddress: Omit<Address, "id" | "userId" | "isDefault">;
}

export interface InitiatePaymentDto {
  orderId: string;
  method: PaymentMethod;
  returnUrl?: string;
}

// ============================================================
// GRUP ÇATISI (checkout group) SÖZLEŞMESİ
// Sunum kuralı: her şey grup bazında gösterilir — tek satın alım bile 1
// siparişlik gruptur; kargo satıcı-paketi başınadır (tek koli/tek barkod);
// ödeme grup başına TEKTİR; iptal grup bazındadır; iade sipariş bazında
// olabilir. Yeni istemciler GET /orders/groups + GET /orders/:id/group
// uçlarını kullanmalıdır (tekil /orders listesi sunum için kullanılmaz).
// ============================================================

/** Satıcı paketi görünümü: satıcı + tek kargo ücreti + paylaşılan kargo takibi. */
export interface OrderPackageView {
  id: string;
  sellerId: string | null;
  seller: PublicIdentity | null;
  /** Alıcı payı — paket başına TEK kargo ücreti. */
  shippingCost: number;
  cargo: {
    trackingNumber: string | null;
    /** Gerçek Sürat barkodu (KargoTakipNo) — paketin tüm siparişleri paylaşır. */
    cargoCode: string | null;
    provider: string | null;
    status: string | null;
    trackingUrl?: string | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
  } | null;
  orders: unknown[];
}

/**
 * Grup çatısı satırı (GET /orders/groups ve GET /orders/:id/group):
 * alıcı için CheckoutGroup, satıcı için kendi paketi, grupsuz (teklif)
 * sipariş için sentetik tek siparişlik grup — hepsi aynı şekil.
 */
export interface OrderGroupView {
  kind: "group" | "package" | "synthetic";
  id: string;
  groupNumber: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  viewerRole: "buyer" | "seller";
  /** Sepetin TEK ödemesi — yalnız alıcı görünümünde dolu. */
  payment: {
    id: string;
    status: string;
    amount: number;
    provider?: string | null;
    paidAt?: string | null;
  } | null;
  packages: OrderPackageView[];
  orders: unknown[];
}
