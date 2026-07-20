import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  failureReason?: string;
  providerPaymentId?: string;
  buyer: { id: string; displayName: string; email: string };
  seller: { id: string; displayName: string; email: string };
  product: { id: string; title: string };
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
    orderId: p.orderId,
    orderNumber: p.orderNumber,
    amount: Number(p.amount || 0),
    currency: p.currency,
    provider: p.provider,
    status: p.status,
    failureReason: p.failureReason,
    providerPaymentId: p.providerPaymentId,
    buyer: p.buyer || { id: "", displayName: "", email: "" },
    seller: p.seller || { id: "", displayName: "", email: "" },
    product: p.product || { id: "", title: "" },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    paidAt: p.paidAt,
  }));
}
