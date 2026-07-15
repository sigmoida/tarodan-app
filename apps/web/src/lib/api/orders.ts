import { api } from "./client";

// Orders
export const ordersApi = {
  getAll: (params?: Record<string, any>) => api.get("/orders", { params }),
  getOne: (id: string | number) => api.get(`/orders/${id}`),
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
    price?: number;
  }) => api.post("/orders/guest", data),
  /** Toplu checkout (üye): sepetteki tüm ürünler tek CheckoutGroup altında, tek ödeme */
  checkout: (data: {
    items: Array<{ productId: string }>;
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
  }) => api.post("/orders/checkout", data),
  /** Toplu checkout (misafir) */
  checkoutGuest: (data: {
    items: Array<{ productId: string }>;
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
  }) => api.post("/orders/checkout/guest", data),
  /** Alıcının sipariş grupları (gruplu liste) */
  getGroups: (params?: Record<string, any>) =>
    api.get("/orders/groups", { params }),
  /** Tek sipariş grubu detayı */
  getGroup: (id: string) => api.get(`/orders/groups/${id}`),
  cancel: (id: string | number, reason?: string) =>
    api.post(`/orders/${id}/cancel`, { reason }),
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
  }) => api.post("/orders/quote", data),
  /** Commission preview for one amount/category (listing form). */
  getCommissionPreview: (params: { amount: number; categoryId?: string }) =>
    api.get("/orders/commission-preview", { params }),
  /** Batch commission preview for multiple items (e.g. ilanlarım list). */
  getCommissionPreviewBatch: (
    items: Array<{ amount: number; categoryId?: string | null }>,
  ) => api.post("/orders/commission-preview-batch", { items }),
};

export type RefundReason =
  | "changed_mind"
  | "damaged"
  | "wrong_item"
  | "not_as_described"
  | "missing_parts"
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
  sellerRequests: () => api.get("/refund-requests/seller"),
  getById: (id: string) => api.get(`/refund-requests/${id}`),
  cancel: (id: string) => api.post(`/refund-requests/${id}/cancel`),
};
