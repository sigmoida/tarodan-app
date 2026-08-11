import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export type PaymentSourceType =
  "order" | "checkout_group" | "trade" | "unlinked";

export interface PaymentParty {
  id: string;
  displayName: string;
  email: string;
}

export interface PaymentTradeItem {
  id: string;
  title: string;
  quantity: number;
}

export interface Payment {
  id: string;
  sourceType: PaymentSourceType;
  reference: {
    type: Exclude<PaymentSourceType, "unlinked">;
    id: string;
    number: string;
  } | null;
  orderId: string | null;
  orderNumber: string | null;
  /** Sepet ödemesi kimliği: grup no + kapsanan sipariş sayısı + grup dosyasına
   * çözülecek anchor sipariş (order id → group file). */
  groupNumber: string | null;
  orderCount: number;
  groupSellerCount: number;
  anchorOrderId: string | null;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  failureReason?: string;
  providerPaymentId?: string;
  payer: PaymentParty | null;
  counterparty: PaymentParty | null;
  buyer: PaymentParty | null;
  seller: PaymentParty | null;
  product: { id: string; title: string } | null;
  trade: {
    id: string;
    tradeNumber: string;
    status: string;
    pricingVersion: string;
    payerId: string;
    recipientId: string | null;
    initiatorItems: PaymentTradeItem[];
    receiverItems: PaymentTradeItem[];
  } | null;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

export const paymentStatusConfig = (t: T): Record<string, StatusConfig> => ({
  pending: {
    label: t("admin.finance.payments.status.pending"),
    variant: "warning",
  },
  processing: {
    label: t("admin.finance.payments.status.processing"),
    variant: "info",
  },
  completed: {
    label: t("admin.finance.payments.status.completed"),
    variant: "success",
  },
  failed: {
    label: t("admin.finance.payments.status.failed"),
    variant: "danger",
  },
  refunded: {
    label: t("admin.finance.payments.status.refunded"),
    variant: "secondary",
  },
});

export const tradePaymentStatusConfig = (
  t: T,
): Record<string, StatusConfig> => ({
  pending: {
    label: t("admin.finance.payments.tradeStatusLabels.pending"),
    variant: "warning",
  },
  accepted: {
    label: t("admin.finance.payments.tradeStatusLabels.accepted"),
    variant: "success",
  },
  rejected: {
    label: t("admin.finance.payments.tradeStatusLabels.rejected"),
    variant: "danger",
  },
  awaiting_payment: {
    label: t("admin.finance.payments.tradeStatusLabels.awaitingPayment"),
    variant: "warning",
  },
  shipping_to_warehouse: {
    label: t("admin.finance.payments.tradeStatusLabels.shippingToWarehouse"),
    variant: "info",
  },
  at_warehouse: {
    label: t("admin.finance.payments.tradeStatusLabels.atWarehouse"),
    variant: "info",
  },
  admin_reviewing: {
    label: t("admin.finance.payments.tradeStatusLabels.adminReviewing"),
    variant: "info",
  },
  shipping_to_recipients: {
    label: t("admin.finance.payments.tradeStatusLabels.shippingToRecipients"),
    variant: "info",
  },
  returning: {
    label: t("admin.finance.payments.tradeStatusLabels.returning"),
    variant: "warning",
  },
  initiator_shipped: {
    label: t("admin.finance.payments.tradeStatusLabels.initiatorShipped"),
    variant: "info",
  },
  receiver_shipped: {
    label: t("admin.finance.payments.tradeStatusLabels.receiverShipped"),
    variant: "info",
  },
  both_shipped: {
    label: t("admin.finance.payments.tradeStatusLabels.bothShipped"),
    variant: "info",
  },
  initiator_received: {
    label: t("admin.finance.payments.tradeStatusLabels.initiatorReceived"),
    variant: "info",
  },
  receiver_received: {
    label: t("admin.finance.payments.tradeStatusLabels.receiverReceived"),
    variant: "info",
  },
  completed: {
    label: t("admin.finance.payments.tradeStatusLabels.completed"),
    variant: "success",
  },
  cancelled: {
    label: t("admin.finance.payments.tradeStatusLabels.cancelled"),
    variant: "danger",
  },
  disputed: {
    label: t("admin.finance.payments.tradeStatusLabels.disputed"),
    variant: "destructive",
  },
});

export const paymentStatusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.common.allStatuses") },
  ...Object.entries(paymentStatusConfig(t)).map(([value, config]) => ({
    value,
    label: config.label,
  })),
];

export const providerFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.payments.allProviders") },
  { value: "paytr", label: "PayTR" },
];

export function mapPayments(raw: any[]): Payment[] {
  return (raw || []).map((p: any) => {
    const sourceType: PaymentSourceType =
      p.sourceType ??
      (p.trade
        ? "trade"
        : p.groupNumber
          ? "checkout_group"
          : p.orderId
            ? "order"
            : "unlinked");

    return {
      id: p.id,
      sourceType,
      reference: p.reference ?? null,
      orderId: p.orderId ?? null,
      orderNumber: p.orderNumber ?? null,
      groupNumber: p.groupNumber ?? null,
      orderCount: p.orderCount ?? (p.orderId ? 1 : 0),
      groupSellerCount: p.groupSellerCount ?? 0,
      anchorOrderId: p.anchorOrderId ?? p.orderId ?? null,
      amount: Number(p.amount || 0),
      currency: p.currency,
      provider: p.provider,
      status: p.status,
      failureReason: p.failureReason,
      providerPaymentId: p.providerPaymentId,
      payer: p.payer ?? p.buyer ?? null,
      counterparty: p.counterparty ?? p.seller ?? null,
      buyer: p.buyer ?? null,
      seller: p.seller ?? null,
      product: p.product ?? null,
      trade: p.trade ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      paidAt: p.paidAt,
    };
  });
}
