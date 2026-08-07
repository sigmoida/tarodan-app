/** @format */

import { tradeStatusConfig } from "@tarodan/ui";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";
import type { TradeItem } from "../../_lib/types";

// Reuse the shared TradeItem shape from the list route.
export type { TradeItem };

/** A single escrow-flow shipment leg attached to a trade. */
export interface TradeShipment {
  id: string;
  direction: "to_warehouse" | "from_warehouse" | "return" | string;
  senderUserId?: string | null;
  recipientUserId?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  /** Real Sürat cargo code (KargoTakipNo), available after branch acceptance. */
  cargoCode?: string | null;
  status?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

/** A single party's payment row on a trade (v2: one per side). */
export interface TradeCashPayment {
  id: string;
  payerId: string;
  /** Farkın gideceği taraf — yalnız fark taşıyan satırda dolu. */
  recipientId?: string | null;
  /** Nakit fark. */
  amount: number;
  /** v2: takas hizmet bedeli (KDV dahil). */
  tradeFeeAmount?: number;
  /** v2: bu tarafın 2 bacaklık kargo bedeli. */
  shippingAmount?: number;
  /** LEGACY (v1): aracılık komisyonu. */
  commission: number;
  totalAmount: number;
  status: string;
  paidAt?: string;
  refundedAt?: string;
}

/** Bir tarafın ödeme dökümü — `GET /trades/:id/payment-quote`. */
export interface TradeQuoteParty {
  userId: string;
  side: "initiator" | "receiver";
  serviceFee: number;
  shipping: number;
  cashDifference: number;
  total: number;
}

export interface TradeQuote {
  tradeId: string;
  initiator: TradeQuoteParty;
  receiver: TradeQuoteParty;
}

/** Kaydedilmemiş teklifin fiyatı — teklif ve karşı teklif ekranları paylaşır. */
export type { TradeQuotePreview } from "@/hooks/useTradeCostPreview";

/**
 * The full trade-detail payload. Superset of the list route's `Trade` — the
 * detail endpoint returns the whole escrow state machine (shipments, cash
 * payment, deadlines, timestamps), so this lives here rather than being forced
 * onto the leaner list type.
 */
export interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiatorId: string;
  initiatorName: string;
  receiverId: string;
  receiverName: string;
  initiatorItems: TradeItem[];
  receiverItems: TradeItem[];
  cashAmount?: number;
  cashPayerId?: string;
  initiatorMessage?: string;
  receiverMessage?: string;
  responseDeadline?: string;
  paymentDeadline?: string;
  shippingDeadline?: string;
  initiatorShipment?: {
    carrier: string;
    trackingNumber: string;
    status: string;
    shippedAt?: string;
    deliveredAt?: string;
  };
  receiverShipment?: {
    carrier: string;
    trackingNumber: string;
    status: string;
    shippedAt?: string;
    deliveredAt?: string;
  };
  shipments?: TradeShipment[];
  /** v2: TARAF BAŞINA bir ödeme satırı (kafa kafaya takasta da iki satır). */
  cashPayments?: TradeCashPayment[];
  /** LEGACY: farkı taşıyan satır — eski istemciler için korunur. */
  cashPayment?: TradeCashPayment;
  cashRefundedAt?: string;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  version?: number;
  canCancel?: boolean;
  firstWarehouseArrivalAt?: string | null;
}

export const tradeStatusEnLabels: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  awaiting_payment: "Awaiting Payment",
  shipping_to_warehouse: "Shipping to Warehouse",
  at_warehouse: "At Tarodan Warehouse",
  admin_reviewing: "Under Review",
  shipping_to_recipients: "Shipping to Recipients",
  returning: "Returning",
  initiator_shipped: "Shipped",
  receiver_shipped: "Shipped",
  both_shipped: "Both Parties Shipped",
  initiator_received: "Received",
  receiver_received: "Received",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

export const tradeStatusTrLabels: Record<string, string> = {
  pending: "Bekliyor",
  accepted: "Kabul Edildi",
  rejected: "Reddedildi",
  awaiting_payment: "Ödeme Bekleniyor",
  shipping_to_warehouse: "Depoya Gönderim",
  at_warehouse: "Tarodan Deposunda",
  admin_reviewing: "İnceleniyor",
  shipping_to_recipients: "Alıcılara Gönderim",
  returning: "İade Yolda",
  initiator_shipped: "Gönderildi",
  receiver_shipped: "Karşı Taraf Gönderdi",
  both_shipped: "İki Taraf Gönderdi",
  initiator_received: "Teslim Alındı",
  receiver_received: "Karşı Taraf Teslim Aldı",
  completed: "Tamamlandı",
  cancelled: "İptal Edildi",
  disputed: "İtiraz Açıldı",
};

/** Locale-aware status label — EN falls back to the label map, TR prefers the
 * shared `tradeStatusConfig` label. */
export const getTradeStatusLabel = (s: string, locale: string): string =>
  locale === "en"
    ? tradeStatusEnLabels[s] || s
    : tradeStatusConfig[s]?.label || tradeStatusTrLabels[s] || s;

export const getTradeStatusMeta = (
  locale: string,
): Record<string, { description: string }> => {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  return {
    pending: {
      description: t("trade.statusMeta.pending"),
    },
    accepted: {
      description: t("trade.statusMeta.accepted"),
    },
    rejected: {
      description: t("offer.offerRejected"),
    },
    awaiting_payment: {
      description: t("trade.statusMeta.awaitingPayment"),
    },
    shipping_to_warehouse: {
      description: t("trade.statusMeta.shippingToWarehouse"),
    },
    at_warehouse: {
      description: t("trade.statusMeta.atWarehouse"),
    },
    admin_reviewing: {
      description: t("trade.statusMeta.adminReviewing"),
    },
    shipping_to_recipients: {
      description: t("trade.statusMeta.shippingToRecipients"),
    },
    returning: {
      description: t("trade.statusMeta.returning"),
    },
    initiator_shipped: {
      description: t("trade.statusMeta.initiatorShipped"),
    },
    receiver_shipped: {
      description: t("trade.statusMeta.receiverShipped"),
    },
    both_shipped: {
      description: t("trade.statusMeta.bothShipped"),
    },
    initiator_received: {
      description: t("trade.statusMeta.initiatorReceived"),
    },
    receiver_received: {
      description: t("trade.statusMeta.receiverReceived"),
    },
    completed: {
      description: t("trade.statusMeta.completed"),
    },
    cancelled: {
      description: t("trade.tradeCancelled"),
    },
    disputed: {
      description: t("trade.disputeOpened"),
    },
  };
};

export const SHIPMENT_STATUS_CHIP: Record<
  string,
  { label: string; className: string; icon?: string }
> = {
  label_created: {
    label: "Etiket Hazır",
    className: "bg-surface-muted text-muted border border-border-subtle",
  },
  pending: {
    label: "Bekleniyor",
    className: "bg-surface-muted text-muted border border-border-subtle",
  },
  in_transit: {
    label: "Yolda",
    className: "bg-surface-alt text-body border border-border",
  },
  delivered: {
    label: "Depoya Ulaştı",
    className: "bg-success-50 text-success-700 border border-success-200",
    icon: "✓",
  },
};

/** Resolve a card image for a counter-offer product row (list-of-images shape). */
export const getProductImage = (product: any): string => {
  if (!product.images || product.images.length === 0) {
    return "https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün";
  }
  const img = product.images[0];
  const url =
    typeof img === "string" ? img : (img.cardUrl ?? img.detailUrl ?? img.url);
  return url || "https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün";
};
