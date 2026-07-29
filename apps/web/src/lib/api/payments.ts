import { api } from "./client";

const paymentCapabilityKey = (paymentId: string) =>
  `payment-capability.${paymentId}`;
const volatilePaymentCapabilities = new Map<string, string>();

function rememberPaymentCapability(response: any): void {
  if (typeof window === "undefined") return;
  const data = response?.data?.data ?? response?.data;
  if (data?.paymentId && data?.paymentAccessToken) {
    volatilePaymentCapabilities.set(data.paymentId, data.paymentAccessToken);
    try {
      sessionStorage.setItem(
        paymentCapabilityKey(data.paymentId),
        data.paymentAccessToken,
      );
    } catch {
      // The current tab can still finish with the memory copy.
    }
  }
}

function paymentCapabilityHeaders(paymentId: string) {
  let token = volatilePaymentCapabilities.get(paymentId) ?? null;
  if (typeof window !== "undefined") {
    try {
      token = sessionStorage.getItem(paymentCapabilityKey(paymentId)) ?? token;
    } catch {
      // Fall back to the memory copy.
    }
  }
  return token ? { "X-Payment-Capability": token } : {};
}

async function initiatePayment(
  path: string,
  target: { orderId?: string | number; checkoutGroupId?: string },
  provider: "paytr",
) {
  const response = await api.post(path, { ...target, provider });
  rememberPaymentCapability(response);
  return response;
}

// Payments
export const paymentsApi = {
  /** Public ödeme yapılandırması: dev bypass, PayTR kart kasası ve recurring yetkileri. */
  getConfig: () =>
    api.get<{
      bypassEnabled: boolean;
      cardStorageEnabled: boolean;
      recurringEnabled: boolean;
    }>("/payments/config"),
  initiate: (orderId: string | number, provider: "paytr") =>
    initiatePayment("/payments/initiate", { orderId }, provider),
  /** Grup ödemesi: tek ödeme checkout grubundaki tüm siparişleri kapsar */
  initiateGroup: (checkoutGroupId: string, provider: "paytr") =>
    initiatePayment("/payments/initiate", { checkoutGroupId }, provider),
  initiateGuest: (orderId: string | number, provider: "paytr") =>
    initiatePayment("/payments/initiate-guest", { orderId }, provider),
  /** Grup ödemesi (misafir) */
  initiateGroupGuest: (checkoutGroupId: string, provider: "paytr") =>
    initiatePayment("/payments/initiate-guest", { checkoutGroupId }, provider),
  /** Takas nakit fark ödemesi başlat (sipariş/teklif ile aynı ödeme altyapısı) */
  initiateTradeCash: (tradeId: string) =>
    api.post("/payments/initiate-trade-cash", { tradeId }),
  getStatus: (paymentId: string) => api.get(`/payments/${paymentId}`),
  getStatusLight: (paymentId: string) =>
    api.get(`/payments/${paymentId}/status`, {
      headers: paymentCapabilityHeaders(paymentId),
    }),
  getStatusLightGuest: (paymentId: string) =>
    api.get(`/payments/${paymentId}/status-guest`, {
      headers: paymentCapabilityHeaders(paymentId),
    }),
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
    api.post<{ released: boolean }>(
      `/payments/${paymentId}/confirm-failed`,
      {},
      { headers: paymentCapabilityHeaders(paymentId) },
    ),
  /** Success sayfasından; PayTR durum-sorgu ile ödemeyi anında tamamlar */
  verify: (paymentId: string) =>
    api.post<{ completed: boolean; status: string }>(
      `/payments/${paymentId}/verify`,
      {},
      { headers: paymentCapabilityHeaders(paymentId) },
    ),
  /**
   * Başarısız ödemeyi yeniden başlatır: backend mevcut `failed` satırı `pending`'e
   * resetler (aynı satır reuse) ve taze merchant_oid atar. iframe kaldırıldığından
   * yanıt bir ödeme URL'i DÖNDÜRMEZ; akış /payment/[id] sayfasında karta girilerek tamamlanır.
   */
  retry: (paymentId: string) =>
    api.post<{
      success: boolean;
      paymentId: string;
      newPaymentId: string;
      orderId: string | null;
      amount: number;
      provider: string;
      expiresIn: number;
    }>(`/payments/${paymentId}/retry`),
  /** Dev/test: PayTR olmadan ödemeyi tamamla */
  bypassComplete: (paymentId: string, _card?: string) =>
    api.post<{ success: boolean }>(`/payments/${paymentId}/bypass-complete`),
  /**
   * Direct API form hazırlığı. Kart numarası/CVV bu API çağrısına eklenmez;
   * istemci dönen alanları kart alanlarıyla birleştirip doğrudan PayTR'ye POST eder.
   */
  prepareDirectForm: (body: {
    paymentId?: string;
    orderId?: string;
    checkoutGroupId?: string;
    tradeId?: string;
    savedCardId?: string;
    saveCard?: boolean;
  }) =>
    api.post<{
      paymentId: string;
      action: string;
      method: "POST";
      fields: Array<{ name: string; value: string }>;
      requireCvv: boolean;
      savedCard: boolean;
      status: "pending";
    }>("/payments/direct-form", body, {
      headers: body.paymentId
        ? paymentCapabilityHeaders(body.paymentId)
        : undefined,
    }),
};
