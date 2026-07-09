// Takas detay route'unun DTO tipleri.

export interface TradeShipment {
  id: string;
  direction: 'to_warehouse' | 'from_warehouse' | 'return' | string;
  senderUserId?: string | null;
  recipientUserId?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
  carrier?: string | null;
}

export interface TradeCashPayment {
  id?: string;
  amount?: number;
  commission?: number;
  totalAmount?: number;
  status?: string;
  paidAt?: string | null;
}

export interface TradeItem {
  id: string;
  productId?: string;
  side?: 'initiator' | 'receiver';
  quantity: number;
  valueAtTrade: number;
  // API'nin döndürdüğü düz alanlar (TradeItemResponseDto):
  productTitle?: string;
  productImage?: string;
  productImages?: Array<{ cardUrl?: string; detailUrl?: string }>;
  // Eski/iç içe şekil — savunmacı fallback.
  product?: {
    id?: string;
    title?: string;
    price?: number;
    images?: Array<{ url?: string; cardUrl?: string }> | string[];
  };
}

export interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiatorId: string;
  receiverId: string;
  cashAmount: number | null;
  cashPayerId: string | null;
  initiatorMessage: string | null;
  receiverMessage: string | null;
  responseDeadline: string;
  initiatorShippedAt: string | null;
  receiverShippedAt: string | null;
  initiatorTrackingNumber: string | null;
  receiverTrackingNumber: string | null;
  completedAt: string | null;
  acceptedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  initiatorName: string;
  receiverName: string;
  // API ürünleri iki ayrı dizi olarak döndürür; eski `items` (side'lı) fallback.
  initiatorItems?: TradeItem[];
  receiverItems?: TradeItem[];
  items?: TradeItem[];
  shipments?: TradeShipment[];
  cashPayment?: TradeCashPayment | null;
  cashCommission?: number | null;
  paymentDeadline?: string | null;
  shippingDeadline?: string | null;
  confirmationDeadline?: string | null;
  version?: number;
  canCancel?: boolean;
  firstWarehouseArrivalAt?: string | null;
}

export type TFn = (key: string, params?: Record<string, string | number>) => string;
