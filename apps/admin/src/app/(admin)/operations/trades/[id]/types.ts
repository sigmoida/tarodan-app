export interface TradeShipment {
  id: string;
  leg?: "to_warehouse" | "from_warehouse" | "return";
  /** Sender of this shipment (always set) — used to map to_warehouse legs to items. */
  shipperId?: string;
  recipientUserId?: string;
  recipientType?: string;
  trackingNumber?: string;
  /** Real Sürat cargo code (KargoTakipNo). */
  providerTrackingId?: string | null;
  carrier?: string;
  status?: string;
  deliveredAt?: string | null;
  shippedAt?: string | null;
  lostAt?: string | null;
  lostReason?: string | null;
  sender?: { id: string; displayName: string } | null;
  recipient?: { id: string; displayName: string } | null;
}

export interface TradeItem {
  id: string;
  product: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url: string }>;
  };
}

export interface TradeDetail {
  id: string;
  tradeNumber?: string;
  status: string;
  cashAmount?: number;
  /** Nakit farkını ödeyen taraf (initiator.id | receiver.id). null = eşit takas. */
  cashPayerId?: string | null;
  /** Escrow nakit ödeme kaydı (accept'te oluşur): komisyon + toplam dahil. */
  cashPayment?: {
    payerId: string;
    recipientId: string;
    amount: number;
    commission: number;
    totalAmount: number;
    status: string;
    paidAt?: string | null;
  } | null;
  initiator: { id: string; displayName: string; email: string };
  receiver: { id: string; displayName: string; email: string };
  initiatorItems: TradeItem[];
  receiverItems: TradeItem[];
  shipments?: TradeShipment[];
  dispute?: {
    id: string;
    reason: string;
    description?: string;
    resolution?: string;
  };
  adminNotes?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  cancelReason?: string;
  createdAt: string;
  acceptedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  warehouseReceivedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  firstWarehouseArrivalAt?: string | null;
  cancelLockedAt?: string | null;
  refundFailureReason?: string | null;
  refundFailureAt?: string | null;
  compensationPendingUserId?: string | null;
  compensationResolvedAt?: string | null;
}

export type RawTradeItem = {
  id: string;
  side?: string;
  product?: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url: string }>;
  };
};
