import { api, guestApi } from "./client";

// Orders API - Web ile aynı endpoint'ler
export type OrderAddressInput = {
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
};

export const ordersApi = {
  getAll: (params?: Record<string, any>) => api.get("/orders", { params }),
  /** Satıcı kazanç özeti (filtre/sayfalama bağımsız): { totalEarnings, pendingEarnings } */
  getSellerEarnings: () =>
    api.get<{ totalEarnings: number; pendingEarnings: number }>(
      "/orders/seller/earnings",
    ),
  getOne: (id: string | number) => api.get(`/orders/${id}`),
  create: (data: any) => api.post("/orders", data),
  /** Buy Now — üye için doğrudan satın alma */
  directBuy: (data: {
    productId: string;
    shippingAddressId?: string;
    shippingAddress?: OrderAddressInput;
    billingAddressId?: string;
    billingAddress?: OrderAddressInput;
  }) => api.post("/orders/buy", data),
  createGuest: (data: {
    productId: string;
    email: string;
    phone: string;
    guestName: string;
    shippingAddress: OrderAddressInput;
    billingAddress?: OrderAddressInput;
    offerId?: string;
    price?: number;
  }) => guestApi.post("/orders/guest", data),
  sendGuestVerificationCode: (data: {
    email: string;
    expectedCheckoutCount?: number;
  }) =>
    guestApi.post<{ success: boolean; expiresInSeconds: number }>(
      "/orders/guest/send-verification-code",
      data,
    ),
  /** Toplu checkout (üye): sepetteki tüm ürünler tek CheckoutGroup altında, tek ödeme */
  checkout: (data: {
    items: Array<{ productId: string }>;
    idempotencyKey: string;
    shippingAddressId?: string;
    shippingAddress?: OrderAddressInput;
    billingAddressId?: string;
    billingAddress?: OrderAddressInput;
    couponCode?: string;
    expectedShippingTariffVersion?: number;
  }) => api.post("/orders/checkout", data),
  /** Toplu checkout (misafir) */
  checkoutGuest: (data: {
    items: Array<{ productId: string }>;
    idempotencyKey: string;
    email: string;
    emailVerificationCode: string;
    phone: string;
    guestName: string;
    shippingAddress: OrderAddressInput;
    billingAddress?: OrderAddressInput;
    expectedShippingTariffVersion?: number;
  }) => guestApi.post("/orders/checkout/guest", data),
  /** Alıcının sipariş grupları (gruplu liste) */
  getGroups: (params?: Record<string, any>) =>
    api.get("/orders/groups", { params }),
  /** Tek sipariş grubu detayı (ürün satırları + ayrı kargolar) */
  getGroup: (id: string) => api.get(`/orders/groups/${id}`),
  cancel: (id: string | number, reason?: string) =>
    api.post(`/orders/${id}/cancel`, { reason }),
  /** Alıcı: teslim aldım onayı (backend: POST /orders/:id/confirm). */
  confirm: (id: string | number) => api.post(`/orders/${id}/confirm`),
  /** Alıcı: 48h pencerede erken onay (backend: POST /orders/:id/confirm-receipt) (Faz 4C). */
  confirmReceipt: (id: string | number) =>
    api.post(`/orders/${id}/confirm-receipt`),
  /** Satıcı: siparişi hazırlanıyor olarak işaretle (backend: POST /orders/:id/prepare) */
  markAsPreparing: (id: string | number) => api.post(`/orders/${id}/prepare`),
  /** İptal edilmiş teklif siparişini yeniden aç (backend: POST /orders/:id/reactivate) */
  reactivate: (id: string | number) => api.post(`/orders/${id}/reactivate`),
  /** Satıcı tarafında kargo adresi/bilgisi güncelleme */
  setShippingAddress: (id: string | number, data: OrderAddressInput) =>
    api.patch(`/orders/${id}/shipping-address`, data),
  /** Guest sipariş takibi (orderNumber + email) */
  trackGuest: (data: { orderNumber: string; email: string }) =>
    guestApi.post("/orders/guest/track", data),
  /** Checkout quote (fiyat kırılımı) */
  getQuote: (data: {
    items: Array<{ productId: string; quantity?: number }>;
  }) => api.post("/orders/quote", data),
  /** İlan formunda komisyon önizleme (tek ürün) */
  getCommissionPreview: (params: { amount: number; categoryId?: string }) =>
    api.get("/orders/commission-preview", { params }),
  /** İlanlarım listesi için toplu komisyon önizleme */
  getCommissionPreviewBatch: (
    items: Array<{ amount: number; categoryId?: string | null }>,
  ) => api.post("/orders/commission-preview-batch", { items }),
};

// eLogo e-Arşiv (gerçek yasal fatura) API
export const elogoInvoicesApi = {
  /** Siparişe ait kullanıcının e-Arşiv faturası (yoksa null) — buton hazırsa çıksın */
  byOrder: (orderId: string) =>
    api.get<{
      id: string;
      invoiceNumber: string;
      label?: string;
      total?: number;
    } | null>(`/elogo/invoices/by-order/${orderId}`),
  /** Fatura PDF — S3 presigned URL döner ({ url }) */
  pdf: (id: string) =>
    api.get<{ url?: string; invoiceNumber?: string }>(
      `/elogo/invoices/${id}/pdf`,
    ),
};

// Kurumsal satıcının siparişe ELLE yüklediği ürün faturası (eLogo gelir faturasından ayrı)
export const sellerInvoiceApi = {
  /** Durum: yüklenmiş fatura + geçerli kullanıcının yükleme yetkisi */
  status: (orderId: string) =>
    api.get<{
      invoice: { id: string; fileName: string; uploadedAt: string } | null;
      canUpload: boolean;
      isSeller: boolean;
      isBuyer: boolean;
    }>(`/orders/${orderId}/seller-invoice`),
  /** İndirme — S3 presigned URL ({ url, fileName }) */
  download: (orderId: string) =>
    api.get<{ url?: string; fileName?: string }>(
      `/orders/${orderId}/seller-invoice/download`,
    ),
};

// Shipping API — Backend `/shipping`
// Tek kargo firması: Sürat Kargo (backend enum'u diğer değerleri hala içerse de
// uygulama yalnızca 'surat' ile çalışıyor — web ile parite).
export type ShippingProvider = "surat";

export const shippingApi = {
  /** Şehir/firma için tek satır kargo ücreti (checkout / addresses) */
  getRatesByCity: (params: {
    city: string;
    carrier: ShippingProvider;
    weight?: number;
  }) => api.get<{ rate: number }>("/shipping/rates", { params }),
  /** Geriye uyumluluk: eski parametre adlarıyla aynı çağrıyı yapan alias */
  getRates: (params: {
    fromCity?: string;
    toCity?: string;
    city?: string;
    carrier?: ShippingProvider;
    weight?: number;
  }) =>
    api.get<{ rate: number } | any>("/shipping/rates", {
      params: {
        city: params.city ?? params.toCity ?? params.fromCity,
        carrier: params.carrier ?? "surat",
        weight: params.weight,
      },
    }),
  /** Kullanılabilir kargo firmaları */
  getCarriers: () => api.get("/shipping/carriers"),
  /** Adres bazlı kargo hesaplama (backend: POST /shipping/rates) */
  calculateRates: (data: {
    fromAddressId: string;
    toAddressId: string;
    weight?: number;
    provider?: ShippingProvider;
  }) => api.post("/shipping/rates", data),
  /** Sipariş için kargo başlat — backend: POST /shipping */
  createShipment: (data: { orderId: string; provider: ShippingProvider }) =>
    api.post("/shipping", data),
  /** Kargo takip numarası gir — backend: PATCH /shipping/:id/tracking */
  updateTracking: (shipmentId: string, data: { trackingNumber: string }) =>
    api.patch(`/shipping/${shipmentId}/tracking`, data),
  /** Tek shipment detayı */
  getShipment: (id: string) => api.get(`/shipping/${id}`),
  /** Siparişin shipment'ları */
  getOrderShipments: (orderId: string) => api.get(`/shipping/order/${orderId}`),
};

/**
 * Buyer + seller refund request endpoints (web ile parite).
 * Backend module: apps/api/src/modules/refund (RefundController).
 * Reasons (Prisma enum RefundReason): changed_mind | damaged | wrong_item |
 * not_as_described | missing_parts | other.
 */
export const refundsApi = {
  /** POST /orders/:orderId/refund-requests
   * refundQuantity: adet bazlı kısmi iade (verilmezse siparişin tüm adedi iade edilir). */
  create: (
    orderId: string,
    body: {
      reason: string;
      description?: string;
      evidencePhotoUrls?: string[];
      refundQuantity?: number;
    },
  ) => api.post(`/orders/${orderId}/refund-requests`, body),
  /** GET /refund-requests/:id */
  getById: (id: string) => api.get(`/refund-requests/${id}`),
  /** GET /refund-requests/me — buyer's own refund requests */
  getMine: () => api.get("/refund-requests/me"),
  /** GET /refund-requests/seller — seller'a gelen iade talepleri */
  getSeller: () => api.get("/refund-requests/seller"),
  /** POST /refund-requests/:id/cancel */
  cancel: (id: string) => api.post(`/refund-requests/${id}/cancel`),
};
