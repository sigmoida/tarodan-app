import { api } from "./client";

// Orders
export const ordersApi = {
  /** The buyer's own submitted review for an order (read-only view). */
  getMyReview: (id: string) =>
    api.get<{
      product: {
        score: number;
        title: string | null;
        review: string | null;
        images: string[];
        createdAt: string;
      } | null;
      seller: {
        score: number;
        comment: string | null;
        createdAt: string;
      } | null;
    }>(`/orders/${id}/my-review`),
  create: (data: any) => api.post("/orders", data),
  // Direct buy for authenticated users (Buy Now)
  directBuy: (data: {
    productId: string;
    shippingAddressId?: string;
    shippingAddress?: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
    billingAddressId?: string;
    billingAddress?: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
    expectedShippingTariffVersion: number;
    expectedCommissionRuleSetId: string;
    expectedCommissionRuleSetVersion: number;
    expectedPricingHash?: string;
  }) => api.post("/orders/buy", data),
  sendGuestVerificationCode: (data: {
    email: string;
    expectedCheckoutCount?: number;
  }) =>
    api.post<{ success: boolean; expiresInSeconds: number }>(
      "/orders/guest/send-verification-code",
      data,
    ),
  createGuest: (data: {
    productId: string;
    email: string;
    phone: string;
    guestName: string;
    emailVerificationCode: string;
    shippingAddress: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
    billingAddress?: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
    offerId?: string;
    expectedShippingTariffVersion: number;
    expectedCommissionRuleSetId: string;
    expectedCommissionRuleSetVersion: number;
    expectedPricingHash?: string;
  }) => api.post("/orders/guest", data),
  /** Toplu checkout (üye): sepetteki tüm ürünler tek CheckoutGroup altında, tek ödeme */
  checkout: (data: {
    items: Array<{ productId: string; quantity?: number }>;
    idempotencyKey: string;
    shippingAddressId?: string;
    shippingAddress?: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
    billingAddressId?: string;
    billingAddress?: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
    couponCode?: string;
    /** Tariff version the quote was built on; 409 PRICING_CHANGED if it moved. */
    expectedShippingTariffVersion: number;
    expectedCommissionRuleSetId: string;
    expectedCommissionRuleSetVersion: number;
    /** Unit-price hash the quote was built on; 409 PRICING_CHANGED if a price/campaign moved. */
    expectedPricingHash?: string;
  }) => api.post("/orders/checkout", data),
  /** Toplu checkout (misafir) */
  checkoutGuest: (data: {
    items: Array<{ productId: string; quantity?: number }>;
    idempotencyKey: string;
    email: string;
    emailVerificationCode: string;
    phone: string;
    guestName: string;
    shippingAddress: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
    billingAddress?: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    };
    couponCode?: string;
    expectedShippingTariffVersion: number;
    expectedCommissionRuleSetId: string;
    expectedCommissionRuleSetVersion: number;
    expectedPricingHash?: string;
  }) => api.post("/orders/checkout/guest", data),
  /** Birleşik grup listesi: alıcı=CheckoutGroup çatısı, satıcı=kendi paketi. */
  getGroups: (params?: {
    role?: "buyer" | "seller";
    tab?: "active" | "cancelled" | "refunds";
    page?: number;
    limit?: number;
  }) => api.get("/orders/groups", { params }),
  /** Tek sipariş grubu detayı */
  getGroup: (id: string) => api.get(`/orders/groups/${id}`),
  /** Sipariş id'sinden grup çatısı (grupsuz sipariş = sentetik tek siparişlik grup). */
  getGroupView: (orderId: string) => api.get(`/orders/${orderId}/group`),
  cancel: (
    id: string | number,
    body: { reasonCode?: OrderCancellationReason; reason?: string },
  ) => api.post(`/orders/${id}/cancel`, body),
  /** GRUP iptali: sepetin tamamı (kısmi iptal yok; kargolanmış üye varsa 400). */
  cancelGroup: (
    groupId: string,
    body: { reasonCode?: OrderCancellationReason; reason?: string },
  ) => api.post(`/orders/groups/${groupId}/cancel`, body),
  confirm: (id: string | number) => api.post(`/orders/${id}/confirm`),
  setShippingAddress: (
    id: string | number,
    data: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    },
  ) => api.patch(`/orders/${id}/shipping-address`, data),
  trackGuest: (data: { orderNumber: string; email: string }) =>
    api.post("/orders/guest/track", data),
  /** Checkout quote (pricing breakdown). Use for order summary; same logic as order create. */
  getQuote: (data: {
    items: Array<{ productId: string; quantity?: number }>;
    couponCode?: string;
  }) => api.post("/orders/quote", data),
  /** Commission preview for one amount/category (listing form). */
  getCommissionPreview: (params: {
    amount: number;
    categoryId?: string;
    packageTier?: string;
  }) => api.get("/orders/commission-preview", { params }),
  /** Batch commission preview for multiple items (e.g. ilanlarım list). */
  getCommissionPreviewBatch: (
    items: Array<{
      amount: number;
      categoryId?: string | null;
      packageTier?: string | null;
    }>,
  ) => api.post("/orders/commission-preview-batch", { items }),
};

export type RefundReason =
  | "changed_mind"
  | "damaged"
  | "wrong_item"
  | "not_as_described"
  | "delivery_delayed"
  | "missing_parts"
  | "counterfeit"
  | "defective"
  | "buyer_damaged"
  | "lost_in_transit"
  | "other";

export type OrderCancellationReason =
  | "delivery_delayed"
  | "wrong_product_selected"
  | "changed_mind"
  | "wrong_card"
  | "price_changed_mind"
  | "unavailable_at_address"
  | "other";

export const refundsApi = {
  create: (
    orderId: string,
    body: {
      reason: RefundReason;
      description?: string;
      evidencePhotoUrls?: string[];
      refundQuantity?: number;
    },
  ) => api.post(`/orders/${orderId}/refund-requests`, body),
  myRequests: () => api.get("/refund-requests/me"),
  getById: (id: string) => api.get(`/refund-requests/${id}`),
  cancel: (id: string) => api.post(`/refund-requests/${id}/cancel`),
};
