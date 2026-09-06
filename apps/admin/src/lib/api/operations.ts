import { api } from "./client";

/**
 * Operations domain: orders, trades (safe-trade/escrow), refund requests,
 * moderated messages, and shipment tracking.
 */
export const operationsApi = {
  // Orders
  getOrders: (params?: any) => api.get("/admin/orders", { params }),
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

  // Offers (Teklifler — /operations/offers; izin: orders)
  getOffers: (params?: any) => api.get("/admin/offers", { params }),
  getOffer: (id: string) => api.get(`/admin/offers/${id}`),
  cancelOffer: (id: string, reason: string) =>
    api.post(`/admin/offers/${id}/cancel`, { reason }),

  // Trades
  getTrades: (params?: any) => api.get("/admin/trades", { params }),
  getTrade: (id: string) => api.get(`/admin/trades/${id}`),
  // Safe-trade (escrow) admin actions
  markWarehouseReceived: (tradeId: string, shipmentId: string) =>
    api.post(`/admin/trades/${tradeId}/mark-warehouse-received`, {
      shipmentId,
    }),
  // Taşıyıcı teslim raporu hiç gelmediğinde operasyonun elle teslim işaretlemesi;
  // iki çıkış kolisi de teslim olunca escrow onay penceresi başlar.
  markOutboundDelivered: (tradeId: string, shipmentId: string, note?: string) =>
    api.post(`/admin/trades/${tradeId}/mark-outbound-delivered`, {
      shipmentId,
      ...(note ? { note } : {}),
    }),
  // Depo kontrolünü üstlen: at_warehouse -> admin_reviewing (kim/ne zaman
  // denetim kaydına yazılır; kullanıcı "kontrol ediliyor" durumunu görür).
  startTradeReview: (tradeId: string) =>
    api.post(`/admin/trades/${tradeId}/start-review`),
  approveTrade: (tradeId: string, notes?: string) =>
    api.post(`/admin/trades/${tradeId}/approve`, notes ? { notes } : {}),
  // faultySide: kontrolde hangi tarafın ürünü elendi — denetim kaydına yazılır.
  rejectTrade: (
    tradeId: string,
    reason: string,
    faultySide: "initiator" | "receiver" | "both" | "neither",
  ) => api.post(`/admin/trades/${tradeId}/reject`, { reason, faultySide }),
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
  markRefundDisputed: (id: string, note: string) =>
    api.post(`/admin/refund-requests/${id}/dispute`, { note: note.trim() }),
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
