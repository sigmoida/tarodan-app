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
  status?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

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
  cashPayment?: {
    id: string;
    payerId: string;
    recipientId: string;
    amount: number;
    commission: number;
    totalAmount: number;
    status: string;
    paidAt?: string;
    refundedAt?: string;
  };
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
      description:
        locale === "en"
          ? "Offer is being evaluated by the recipient"
          : "Teklif alıcı tarafından değerlendiriliyor",
    },
    accepted: {
      description:
        locale === "en"
          ? "Trade accepted, awaiting shipment"
          : "Takas kabul edildi, gönderim bekleniyor",
    },
    rejected: {
      description: t("offer.offerRejected"),
    },
    awaiting_payment: {
      description:
        locale === "en"
          ? "Cash payment required to proceed"
          : "Devam etmek için nakit ödeme gerekli",
    },
    shipping_to_warehouse: {
      description:
        locale === "en"
          ? "Both parties must ship their items to the Tarodan warehouse"
          : "Her iki taraf ürünlerini Tarodan deposuna göndermelidir",
    },
    at_warehouse: {
      description:
        locale === "en"
          ? "Your items are at the Tarodan warehouse and being reviewed"
          : "Ürünleriniz Tarodan deposunda, inceleme başlatıldı",
    },
    admin_reviewing: {
      description:
        locale === "en"
          ? "An admin is physically reviewing the items"
          : "Admin ürünleri fiziksel olarak inceliyor",
    },
    shipping_to_recipients: {
      description:
        locale === "en"
          ? "Admin approved — items are being shipped to the recipients"
          : "Admin onayladı — ürünler alıcılara gönderiliyor",
    },
    returning: {
      description:
        locale === "en"
          ? "Trade was rejected — items are being returned to their owners"
          : "Takas reddedildi — ürünler sahiplerine iade ediliyor",
    },
    initiator_shipped: {
      description:
        locale === "en"
          ? "Initiator shipped their items"
          : "Başlatıcı ürünlerini gönderdi",
    },
    receiver_shipped: {
      description:
        locale === "en"
          ? "Receiver shipped their items"
          : "Alıcı ürünlerini gönderdi",
    },
    both_shipped: {
      description:
        locale === "en"
          ? "Both parties shipped their items"
          : "Her iki taraf da ürünlerini gönderdi",
    },
    initiator_received: {
      description:
        locale === "en"
          ? "Initiator received the items"
          : "Başlatıcı ürünleri teslim aldı",
    },
    receiver_received: {
      description:
        locale === "en"
          ? "Receiver received the items"
          : "Alıcı ürünleri teslim aldı",
    },
    completed: {
      description:
        locale === "en"
          ? "Trade successfully completed"
          : "Takas başarıyla tamamlandı",
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
    className: "bg-info-50 text-info-700 border border-info-200",
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
