import { api } from "./client";

/**
 * Operations domain: orders, trades (safe-trade/escrow), refund requests,
 * moderated messages, and shipment tracking.
 */
export const operationsApi = {
  // Refunds (payment refund history)
  getRefundHistory: (params?: {
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/admin/payments/refunds", { params }),

  // Orders
  getOrders: (params?: any) => api.get("/admin/orders", { params }),
  getOrder: (id: string) => api.get(`/admin/orders/${id}`),
  /** Grup dosyası: order id grup çatısına çözülür (ödeme + paketler + sipariş finans/escrow/iade). */
  getOrderFile: (id: string) => api.get(`/admin/orders/${id}/file`),
  updateOrderStatus: (id: string, status: string, notes: string) =>
    api.patch(`/admin/orders/${id}`, { status, notes }),
  addOrderTracking: (
    id: string,
    payload: {
      trackingNumber: string;
      carrier: "surat";
      notes: string;
    },
  ) => api.post(`/admin/orders/${id}/tracking`, payload),
  getOrderInvoice: (id: string) => api.get(`/admin/orders/${id}/invoice`),
  applyOrderCoupon: (id: string, code: string | null) =>
    api.post(`/admin/orders/${id}/apply-coupon`, { code }),
  // 48h window (Phase 4A.1)
  forceCompleteOrder: (id: string, reason: string) =>
    api.post(`/admin/orders/${id}/force-complete`, { reason }),
  extendOrderConfirmation: (
    id: string,
    payload: { hours: number; reason?: string },
  ) => api.post(`/admin/orders/${id}/extend-confirmation`, payload),

  // RefundRequest policy override (Phase 4B.1)
  overrideRefundPolicy: (
    id: string,
    payload: {
      refundProductAmount?: boolean;
      refundShippingFee?: boolean;
      refundBuyerFee?: boolean;
      refundSellerCommission?: boolean;
    },
  ) => api.patch(`/admin/refund-requests/${id}/override-policy`, payload),

  setReturnShippingPayer: (
    id: string,
    payer: "buyer" | "seller" | "platform",
  ) => api.patch(`/admin/refund-requests/${id}/set-shipping-payer`, { payer }),

  // Trades
  getTrades: (params?: any) => api.get("/admin/trades", { params }),
  getTrade: (id: string) => api.get(`/admin/trades/${id}`),
  resolveTrade: (id: string, resolution: any) =>
    api.post(`/admin/trades/${id}/resolve`, resolution),
  // Safe-trade (escrow) admin actions
  markWarehouseReceived: (tradeId: string, shipmentId: string) =>
    api.post(`/admin/trades/${tradeId}/mark-warehouse-received`, {
      shipmentId,
    }),
  approveTrade: (tradeId: string, notes?: string) =>
    api.post(`/admin/trades/${tradeId}/approve`, notes ? { notes } : {}),
  rejectTrade: (tradeId: string, reason: string) =>
    api.post(`/admin/trades/${tradeId}/reject`, { reason }),
  markReturnDelivered: (tradeId: string, shipmentId: string) =>
    api.post(`/admin/trades/${tradeId}/mark-return-delivered`, { shipmentId }),
  retryTradeRefund: (tradeId: string) =>
    api.post(`/admin/trades/${tradeId}/retry-refund`),
  resolveTradeCompensation: (tradeId: string, note?: string) =>
    api.post(
      `/admin/trades/${tradeId}/resolve-compensation`,
      note ? { note } : {},
    ),

  // RefundRequest admin
  getRefundRequests: (params?: any) =>
    api.get("/admin/refund-requests", { params }),
  getRefundRequest: (id: string) => api.get(`/admin/refund-requests/${id}`),
  previewRefundDecision: (
    id: string,
    body: { resolvedReason: string; faultParty: string },
  ) => api.post(`/admin/refund-requests/${id}/decision-preview`, body),
  approveRefundRequest: (
    id: string,
    body: {
      note?: string;
      resolvedReason?: string;
      faultParty?: string;
      calculationToken?: string;
    } = {},
  ) => api.post(`/admin/refund-requests/${id}/approve`, body),
  rejectRefundRequest: (id: string, reason: string) =>
    api.post(`/admin/refund-requests/${id}/reject`, {
      reason: reason.trim(),
    }),
  forceFinalizeRefund: (id: string) =>
    api.post(`/admin/refund-requests/${id}/force-finalize`),
  markTradeReturnLost: (
    tradeId: string,
    body: { shipmentId: string; reason: string; compensateUserId?: string },
  ) => api.post(`/admin/trades/${tradeId}/mark-return-lost`, body),
  forceCancelStuckTrade: (
    tradeId: string,
    body: { reason: string; sendArrivedItemBack: boolean },
  ) => api.post(`/admin/trades/${tradeId}/force-cancel-stuck`, body),
  resolveTradeDispute: (tradeId: string, resolution: string, notes: string) =>
    api.post(`/trades/${tradeId}/resolve-dispute`, { resolution, notes }),

  // Trade shipments (cross-trade listing)
  getTradeShipments: (params?: any) =>
    api.get("/admin/trade-shipments", { params }),

  // Messages
  getMessages: (params?: any) => api.get("/admin/messages", { params }),
  getMessage: (id: string) => api.get(`/admin/messages/${id}`),
  approveMessage: (id: string, notes?: string) =>
    api.post(`/admin/messages/${id}/approve`, notes ? { notes } : {}),
  rejectMessage: (id: string, reason?: string) =>
    api.post(`/admin/messages/${id}/reject`, { reason }),
  revertMessage: (id: string) => api.post(`/admin/messages/${id}/revert`),

  // Shipping (operations) — view/track order shipments (read-only).
  // Config (methods/carriers/zones/rates) and label generation removed; real shipping is the Sürat integration.
  getShipments(params?: any) {
    return api.get("/admin/shipping/shipments", { params });
  },
  getCarrierCancellationTasks(params?: any) {
    return api.get("/admin/shipping/carrier-cancellations", { params });
  },
  resolveCarrierCancellationTask(
    id: string,
    body: { status: "resolved" | "dismissed"; resolution: string },
  ) {
    return api.patch(`/admin/shipping/carrier-cancellations/${id}`, body);
  },
  // Syncs a Sürat shipment's tracking status instantly, without waiting for the 30-min cron.
  syncShipmentTracking(id: string) {
    return api.post(`/admin/shipping/shipments/${id}/sync-tracking`);
  },
  // Sürat REST endpoint test: create a shipment + query its tracking (returns raw responses).
  suratEndpointTest() {
    return api.post("/admin/shipping/surat/endpoint-test");
  },
  // Test console: Sürat tracking query by reference (KargoTakipHareketDetayi).
  suratTestTrack(ref: string) {
    return api.post("/admin/shipping/surat/track", { ref });
  },
};
