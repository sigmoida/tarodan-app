import type { AxiosResponse } from "axios";
import type {
  DirectFormInstallmentSelection,
  InstallmentOptionsRequest,
  InstallmentOptionsResponse,
  PaymentsInstallmentsConfig,
} from "@tarodan/types";
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

/**
 * Ödemenin AMACI. Sepet ödemesi ile üyelik ödemesi ayrı PayTR mağazalarında
 * alınır; kayıtlı kartlar mağazaya özeldir, bu yüzden kart listesi ve kart
 * saklama yeteneği amaca göre okunur.
 */
export type PaymentPurpose = "checkout" | "membership";

export type PaymentPurposeCapabilities = {
  cardStorageEnabled: boolean;
  recurringEnabled: boolean;
};

export type PaymentConfig = {
  bypassEnabled: boolean;
  /** Geriye uyum: sepet ödemesinin kart saklama yeteneği. */
  cardStorageEnabled: boolean;
  /** Geriye uyum: oto-yenileme (üyelik mağazası) açık mı. */
  recurringEnabled: boolean;
  /** Eski API bu alanı döndürmeyebilir. */
  purposes?: Record<PaymentPurpose, PaymentPurposeCapabilities>;
  /**
   * Installment switch and minimum goods total (ADR 0019). Absent on an
   * older API: off. Read it through `installmentsConfigOf` (fail closed).
   */
  installments?: Partial<PaymentsInstallmentsConfig>;
};

/** Amaca göre yetenekler — `purposes` yoksa (eski API) üst düzey alanlara düşer. */
export function paymentCapabilities(
  config: PaymentConfig,
  purpose: PaymentPurpose,
): PaymentPurposeCapabilities {
  return (
    config.purposes?.[purpose] ?? {
      cardStorageEnabled: config.cardStorageEnabled,
      recurringEnabled: config.recurringEnabled,
    }
  );
}

// Payments
export const paymentsApi = {
  /** Public ödeme yapılandırması: dev bypass ve amaç başına PayTR kart kasası / recurring yetkileri. */
  getConfig: () => api.get<PaymentConfig>("/payments/config"),
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
    /**
     * Bu ekranda mesafeli satış onayı verildi mi. Sunucu, satın almanın henüz
     * onay kaydı yoksa (teklif siparişi) burada kaydeder.
     */
    distanceSalesAccepted?: boolean;
    /**
     * The installment the buyer chose (count above 1 only; absent = single
     * payment). Carries at most the first 8 card digits, never the number.
     */
    installment?: DirectFormInstallmentSelection;
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
  /**
   * The installment options of a card for a payment (`paymentId`) or, on the
   * single-page checkout before the order exists, for the goods total
   * (`amount`, display only). PCI: `bin` is at most the first 8 digits. A
   * guest's payment carries its capability header, as for `direct-form`.
   */
  installmentOptions: (
    body: InstallmentOptionsRequest,
    options?: { signal?: AbortSignal },
  ) =>
    api.post<InstallmentOptionsResponse>(
      "/payments/installment-options",
      body,
      {
        signal: options?.signal,
        headers: body.paymentId
          ? paymentCapabilityHeaders(body.paymentId)
          : undefined,
      },
    ),
};

/** What an initiate call answers (only the id is read; some envelopes nest it). */
type InitiateResponse = AxiosResponse<{
  paymentId?: unknown;
  data?: { paymentId?: unknown };
}>;

/**
 * Starts the payment of a target anew: the server resets a pending row to the
 * current order, cart or trade total (CAS-guarded; nothing is charged) and
 * answers its id, which may be a new one. Used once after `direct-form`
 * answers 409 `server.payment.paymentAmountOutOfDate`. `null` when the target
 * holds nothing to initiate.
 */
export async function reinitiatePayment(
  target: { orderId?: string; checkoutGroupId?: string; tradeId?: string },
  guest: boolean,
): Promise<string | null> {
  let request: Promise<InitiateResponse> | null = null;
  if (target.tradeId) {
    request = paymentsApi.initiateTradeCash(target.tradeId);
  } else if (target.checkoutGroupId) {
    request = guest
      ? paymentsApi.initiateGroupGuest(target.checkoutGroupId, "paytr")
      : paymentsApi.initiateGroup(target.checkoutGroupId, "paytr");
  } else if (target.orderId) {
    request = guest
      ? paymentsApi.initiateGuest(target.orderId, "paytr")
      : paymentsApi.initiate(target.orderId, "paytr");
  }
  if (!request) return null;
  const response = await request;
  const id = response.data?.data?.paymentId ?? response.data?.paymentId;
  return typeof id === "string" && id ? id : null;
}
