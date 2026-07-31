import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface Payment {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  /** Sepet ödemesi kimliği: grup no + kapsanan sipariş sayısı + grup dosyasına
   * çözülecek anchor sipariş (order id → group file). */
  groupNumber: string | null;
  orderCount: number;
  anchorOrderId: string | null;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  failureReason?: string;
  providerPaymentId?: string;
  buyer: { id: string; displayName: string; email: string } | null;
  seller: { id: string; displayName: string; email: string } | null;
  product: { id: string; title: string } | null;
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
  return (raw || []).map((p: any) => ({
    id: p.id,
    orderId: p.orderId ?? null,
    orderNumber: p.orderNumber ?? null,
    groupNumber: p.groupNumber ?? null,
    orderCount: p.orderCount ?? (p.orderId ? 1 : 0),
    anchorOrderId: p.anchorOrderId ?? p.orderId ?? null,
    amount: Number(p.amount || 0),
    currency: p.currency,
    provider: p.provider,
    status: p.status,
    failureReason: p.failureReason,
    providerPaymentId: p.providerPaymentId,
    buyer: p.buyer ?? null,
    seller: p.seller ?? null,
    product: p.product ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    paidAt: p.paidAt,
  }));
}
