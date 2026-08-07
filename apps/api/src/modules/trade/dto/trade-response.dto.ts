import { TradeStatus, ShipmentStatus, PaymentStatus } from "@prisma/client";

export class TradeItemResponseDto {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  productImages?: { cardUrl: string; detailUrl?: string }[];
  side: string;
  quantity: number;
  valueAtTrade: number;
}

export class TradeShipmentResponseDto {
  id: string;
  shipperId: string;
  shipperName: string;
  carrier: string;
  trackingNumber?: string;
  /** Real Sürat cargo code (KargoTakipNo), available after branch acceptance. */
  cargoCode?: string;
  status: ShipmentStatus;
  shippedAt?: Date;
  deliveredAt?: Date;
  confirmedAt?: Date;
}

export class TradeEscrowShipmentResponseDto {
  id: string;
  direction: "to_warehouse" | "from_warehouse" | "return" | string;
  senderUserId?: string;
  recipientUserId?: string;
  carrier?: string;
  trackingNumber?: string;
  /** Real Sürat cargo code (KargoTakipNo), available after branch acceptance. */
  cargoCode?: string;
  status?: ShipmentStatus;
  shippedAt?: Date;
  deliveredAt?: Date;
}

export class TradeCashPaymentResponseDto {
  id: string;
  payerId: string;
  /** Farkın gideceği taraf — yalnız fark taşıyan satırda dolu. */
  recipientId: string | null;
  /** Nakit fark (v2'de yalnız farkı ödeyen tarafta > 0). */
  amount: number;
  /** v2: takas hizmet bedeli (KDV DAHİL). */
  tradeFeeAmount: number;
  /** v2: bu tarafın 2 bacaklık kargo bedeli. */
  shippingAmount: number;
  /** LEGACY (v1): aracılık komisyonu. */
  commission: number;
  totalAmount: number;
  status: PaymentStatus;
  paidAt?: Date;
}

export class TradeDisputeResponseDto {
  id: string;
  raisedById: string;
  reason: string;
  description: string;
  resolution?: string;
  resolvedAt?: Date;
}

export class TradeResponseDto {
  id: string;
  tradeNumber: string;

  initiatorId: string;
  initiatorName: string;
  receiverId: string;
  receiverName: string;

  status: TradeStatus;

  initiatorItems: TradeItemResponseDto[];
  receiverItems: TradeItemResponseDto[];

  cashAmount?: number;
  cashPayerId?: string;
  cashCommission?: number;

  initiatorMessage?: string;
  receiverMessage?: string;

  responseDeadline: Date;
  paymentDeadline?: Date;
  shippingDeadline?: Date;
  confirmationDeadline?: Date;

  initiatorShipment?: TradeShipmentResponseDto;
  receiverShipment?: TradeShipmentResponseDto;
  shipments?: TradeEscrowShipmentResponseDto[];

  /**
   * v2: TARAF BAŞINA bir ödeme satırı. Ekranlar iki tarafın kalemlerini de
   * gösterdiği için tamamı döner; istemci kendi satırını `payerId` ile bulur.
   */
  cashPayments: TradeCashPaymentResponseDto[];
  /**
   * LEGACY: farkı taşıyan (yoksa ilk) satır. v1 istemcileri (mobil) bu alandan
   * okuduğu için korunur; yeni ekranlar `cashPayments`i kullanır.
   */
  cashPayment?: TradeCashPaymentResponseDto;
  dispute?: TradeDisputeResponseDto;

  acceptedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;

  // Stamped when the first to_warehouse shipment is received. Once set,
  // user-side cancel is locked and only admin can resolve.
  firstWarehouseArrivalAt?: Date | null;
  // Derived for the requesting viewer: true only when this user is allowed to
  // cancel the trade right now (participant + eligible state + not locked).
  canCancel?: boolean;

  version?: number;

  createdAt: Date;
  updatedAt: Date;
}

export class TradeListResponseDto {
  trades: TradeResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}
