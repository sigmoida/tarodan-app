import { api } from "./client";

// Trades
export const tradesApi = {
  getAll: (params?: Record<string, any>) => api.get("/trades", { params }),
  getOne: (id: string | number) => api.get(`/trades/${id}`),
  create: (data: {
    receiverId: string;
    initiatorItems: Array<{ productId: string; quantity: number }>;
    receiverItems: Array<{ productId: string; quantity: number }>;
    cashAmount?: number;
    message?: string;
    shippingAddressId?: string;
  }) => api.post("/trades", data),
  accept: (id: string | number, message?: string, shippingAddressId?: string) =>
    api.post(`/trades/${id}/accept`, { message, shippingAddressId }),
  reject: (id: string | number, reason?: string) =>
    api.post(`/trades/${id}/reject`, { reason }),
  counter: (
    id: string | number,
    data: {
      initiatorItems: Array<{ productId: string; quantity: number }>;
      receiverItems: Array<{ productId: string; quantity: number }>;
      cashAmount?: number;
      message?: string;
    },
  ) => api.post(`/trades/${id}/counter`, data),
  cancel: (id: string | number, reason?: string) =>
    api.post(`/trades/${id}/cancel`, { reason }),
  ship: (
    id: string | number,
    data: { fromAddressId: string; carrier: string },
  ) => api.post(`/trades/${id}/ship`, data),
  confirmReceipt: (id: string | number) =>
    api.post(`/trades/${id}/confirm-receipt`),
  raiseDispute: (
    id: string | number,
    data: { reason: string; description: string; evidenceUrls?: string[] },
  ) => api.post(`/trades/${id}/dispute`, data),
  initiateCashPayment: (id: string | number) =>
    api.post(`/trades/${id}/cash-payment/initiate`),
  /** Kabul edilmiş/edilecek takasın taraf başına ödeme dökümü (v2; v1'de null). */
  paymentQuote: (id: string | number) => api.get(`/trades/${id}/payment-quote`),
  /** Kaydedilmemiş teklifin maliyeti — karşı teklif düzenleyicisi için. */
  previewPaymentQuote: (data: {
    initiatorItems: Array<{ productId: string; quantity: number }>;
    receiverItems: Array<{ productId: string; quantity: number }>;
    cashAmount?: number;
    cashPayer?: "initiator" | "receiver";
  }) => api.post("/trades/payment-quote/preview", data),
};
