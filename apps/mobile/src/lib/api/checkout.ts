import { api, guestApi } from './client';
import * as SecureStore from 'expo-secure-store';

const paymentCapabilityKey = (paymentId: string) =>
  `payment-capability.${paymentId}`;
const volatilePaymentCapabilities = new Map<string, string>();

async function rememberPaymentCapability(response: any): Promise<void> {
  const data = response?.data?.data ?? response?.data;
  if (data?.paymentId && data?.paymentAccessToken) {
    volatilePaymentCapabilities.set(data.paymentId, data.paymentAccessToken);
    try {
      await SecureStore.setItemAsync(
        paymentCapabilityKey(data.paymentId),
        data.paymentAccessToken,
      );
    } catch {
      // The current app session can still finish with the memory copy.
    }
  }
}

async function paymentCapabilityHeaders(paymentId: string) {
  let token = volatilePaymentCapabilities.get(paymentId) ?? null;
  try {
    token =
      (await SecureStore.getItemAsync(paymentCapabilityKey(paymentId))) ??
      token;
  } catch {
    // Fall back to the memory copy.
  }
  return token ? { 'X-Payment-Capability': token } : {};
}

async function initiatePayment(
  client: typeof api,
  path: string,
  target: { orderId?: string | number; checkoutGroupId?: string },
  provider: 'paytr',
) {
  const response = await client.post(path, { ...target, provider });
  await rememberPaymentCapability(response);
  return response;
}

// Addresses API - Web ile aynı endpoint'ler
export const addressesApi = {
  getAll: () => api.get('/users/me/addresses'),
  getOne: (id: string) => api.get(`/users/me/addresses/${id}`),
  create: (data: {
    title?: string;
    fullName: string;
    phone: string;
    city: string;
    district: string;
    address: string;
    zipCode?: string;
    isDefault?: boolean;
  }) => api.post('/users/me/addresses', data),
  update: (id: string, data: {
    title?: string;
    fullName?: string;
    phone?: string;
    city?: string;
    district?: string;
    address?: string;
    zipCode?: string;
    isDefault?: boolean;
  }) => api.patch(`/users/me/addresses/${id}`, data),
  delete: (id: string) => api.delete(`/users/me/addresses/${id}`),
  setDefault: (id: string) => api.patch(`/users/me/addresses/${id}`, { isDefault: true }),
};

// Payments API - Web ile aynı endpoint'ler
export const paymentsApi = {
  /** Public ödeme yapılandırması: bypass (dev) + kayıtlı kart/oto-yenileme (Non3D) açık mı. */
  getConfig: () =>
    api.get<{ bypassEnabled: boolean; recurringEnabled: boolean }>('/payments/config'),
  initiate: (orderId: string | number, provider: 'paytr' = 'paytr') =>
    initiatePayment(api, '/payments/initiate', { orderId }, provider),
  /** Grup ödemesi: tek ödeme checkout grubundaki tüm siparişleri kapsar */
  initiateGroup: (checkoutGroupId: string, provider: 'paytr' = 'paytr') =>
    initiatePayment(api, '/payments/initiate', { checkoutGroupId }, provider),
  initiateGuest: (orderId: string | number, provider: 'paytr' = 'paytr') =>
    initiatePayment(guestApi, '/payments/initiate-guest', { orderId }, provider),
  /** Grup ödemesi (misafir) */
  initiateGroupGuest: (checkoutGroupId: string, provider: 'paytr' = 'paytr') =>
    initiatePayment(guestApi, '/payments/initiate-guest', { checkoutGroupId }, provider),
  /** Takas nakit fark ödemesi başlat */
  initiateTradeCash: (tradeId: string) =>
    api.post('/payments/initiate-trade-cash', { tradeId }),
  getStatus: (paymentId: string) =>
    api.get(`/payments/${paymentId}`),
  /** POST /payments/:id/verify — PayTR ödemesini aktif doğrula (web ile parite) */
  verify: async (paymentId: string) =>
    api.post(
      `/payments/${paymentId}/verify`,
      {},
      { headers: await paymentCapabilityHeaders(paymentId) },
    ),
  getStatusLight: (paymentId: string) =>
    paymentCapabilityHeaders(paymentId).then((headers) =>
      api.get(`/payments/${paymentId}/status`, { headers }),
    ),
  getStatusLightGuest: (paymentId: string) =>
    paymentCapabilityHeaders(paymentId).then((headers) =>
      guestApi.get(`/payments/${paymentId}/status-guest`, { headers }),
    ),
  getMyPayments: (params?: {
    status?: string;
    provider?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => api.get('/payments/me', { params }),
  cancel: (paymentId: string) =>
    api.post(`/payments/${paymentId}/cancel`),
  /** Fail sayfasında; hâlâ pending ise rezervasyonu serbest bırakır */
  confirmFailed: async (paymentId: string) =>
    api.post(
      `/payments/${paymentId}/confirm-failed`,
      {},
      { headers: await paymentCapabilityHeaders(paymentId) },
    ),
  /** Test bypass: PAYMENT_BYPASS=true iken tek kart başarılı */
  bypassComplete: (paymentId: string, cardNumber?: string) =>
    api.post(
      `/payments/${paymentId}/bypass-complete`,
      cardNumber ? { cardNumber } : {},
    ),
  retry: (paymentId: string) =>
    api.post(`/payments/${paymentId}/retry`),
  /**
   * Direct API (TEK ödeme yolu; misafir + üye): kendi kart formumuzdan ödeme.
   * Yeni kart → 3DS HTML döner (WebView'de gösterilir); kayıtlı kart → Non3D anında status
   * (PAYTR_RECURRING_ENABLED açıkken).
   */
  processDirect: (body: {
    paymentId?: string;
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
    body.paymentId
      ? paymentCapabilityHeaders(body.paymentId).then((headers) =>
          api.post('/payments/process-direct', body, { headers }),
        )
      : api.post('/payments/process-direct', body),
};
