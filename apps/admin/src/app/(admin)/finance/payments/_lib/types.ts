import { paymentStatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";
import { statusConfig } from "@/lib/statusLabels";

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

export const paymentStatusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.common.allStatuses") },
  ...Object.entries(statusConfig(paymentStatusConfig, t)).map(
    ([value, config]) => ({
      value,
      label: config.label,
    }),
  ),
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
