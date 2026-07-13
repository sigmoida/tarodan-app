import { api } from "./client";

// Payments
export const paymentsApi = {
  /** Public ödeme yapılandırması: bypass (dev) ve kayıtlı kart/oto-yenileme (Non3D) açık mı. */
  getConfig: () =>
    api.get<{ bypassEnabled: boolean; recurringEnabled: boolean }>(
      "/payments/config",
    ),
  initiate: (orderId: string | number, provider: "paytr") =>
    api.post("/payments/initiate", { orderId, provider }),
  /** Grup ödemesi: tek ödeme checkout grubundaki tüm siparişleri kapsar */
  initiateGroup: (checkoutGroupId: string, provider: "paytr") =>
    api.post("/payments/initiate", { checkoutGroupId, provider }),
  initiateGuest: (orderId: string | number, provider: "paytr") =>
    api.post("/payments/initiate-guest", { orderId, provider }),
  /** Grup ödemesi (misafir) */
  initiateGroupGuest: (checkoutGroupId: string, provider: "paytr") =>
    api.post("/payments/initiate-guest", { checkoutGroupId, provider }),
  /** Takas nakit fark ödemesi başlat (sipariş/teklif ile aynı ödeme altyapısı) */
  initiateTradeCash: (tradeId: string) =>
    api.post("/payments/initiate-trade-cash", { tradeId }),
  getStatus: (paymentId: string) => api.get(`/payments/${paymentId}`),
  getStatusLight: (paymentId: string) =>
    api.get(`/payments/${paymentId}/status`),
  getStatusLightGuest: (paymentId: string) =>
    api.get(`/payments/${paymentId}/status-guest`),
  getMyPayments: (params?: {
    status?: string;
    provider?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => api.get("/payments/me", { params }),
  cancel: (paymentId: string) => api.post(`/payments/${paymentId}/cancel`),
  /** Fail sayfasından; ödeme hâlâ pending ise rezervasyonu serbest bırakır */
  confirmFailed: (paymentId: string) =>
    api.post<{ released: boolean }>(`/payments/${paymentId}/confirm-failed`),
  /** Success sayfasından; PayTR durum-sorgu ile ödemeyi anında tamamlar */
  verify: (paymentId: string) =>
    api.post<{ completed: boolean; status: string }>(
      `/payments/${paymentId}/verify`,
    ),
  refund: (orderId: string, refundAmount?: number) =>
    api.post("/payments/refund", { orderId, refundAmount }),
  retry: (paymentId: string) => api.post(`/payments/${paymentId}/retry`),
  /** Dev/test: PayTR olmadan ödemeyi tamamla */
  bypassComplete: (paymentId: string, _card?: string) =>
    api.post<{ success: boolean }>(`/payments/${paymentId}/bypass-complete`),
  /**
   * Direct API (TEK ödeme yolu; misafir + üye): kendi kart formumuzdan ödeme.
   * - Yeni kart: { orderId, card:{...}, saveCard } → yanıt 3DS HTML (threeDSHtml) içerir.
   * - Kayıtlı kart: { orderId, savedCardId, cvv? } → Non3D, anında status (PAYTR_RECURRING_ENABLED).
   */
  processDirect: (body: {
    orderId?: string;
    checkoutGroupId?: string;
    tradeId?: string;
    card?: {
      cardHolderName: string;
      cardNumber: string;
      expireMonth: string;
      expireYear: string;
      cvc: string;
    };
    savedCardId?: string;
    cvv?: string;
    saveCard?: boolean;
  }) =>
    api.post<{
      paymentId: string;
      orderId?: string;
      threeDSHtml: string | null;
      status: "pending" | "success" | "failed" | "wait_callback";
      reason?: string | null;
    }>("/payments/process-direct", body),
};
