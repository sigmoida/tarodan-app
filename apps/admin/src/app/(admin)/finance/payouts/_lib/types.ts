import {
  ListBulletIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  ReceiptRefundIcon,
} from "@heroicons/react/24/outline";
import { payoutStatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface PayoutSummary {
  totalPending: number;
  totalReleased: number;
  /** Serbest bırakılmış ama banka transferi HENÜZ tamamlanmamış tutar. */
  releasedAwaitingTransfer: number;
  /** Satıcı hesabına gerçekten geçen NET tutar (tamamlanan transferler). */
  transferredTotal: number;
  transferredCount: number;
  failedTransferCount: number;
  countHeld: number;
  countReleased: number;
  nextReleases: Array<{
    id: string;
    orderId: string;
    amount: number;
    releaseAt: string | null;
    sellerId: string;
  }>;
}

/** Gerçek banka transferi satırı (PayoutTransfer). */
export interface PayoutTransferRow {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  tradeCashPaymentId: string | null;
  seller: { id: string; displayName: string | null; email: string | null };
  amount: number;
  netAmount: number;
  adjustmentDeduction: number;
  ibanLast4: string;
  status: string;
  failureReason: string | null;
  retryCount: number;
  processedAt: string | null;
  createdAt: string;
}

/** Satıcı borç mahsubu satırı (SellerAccountAdjustment). */
export interface PayoutAdjustmentRow {
  id: string;
  seller: { id: string; displayName: string | null; email: string | null };
  orderId: string | null;
  orderNumber: string | null;
  type: "return_shipping" | "shipping_deficit" | "outbound_shipping";
  amount: number;
  remainingAmount: number;
  status: "open" | "settled";
  settledAt: string | null;
  createdAt: string;
}

export interface PayoutTransaction {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  amount: number;
  status: string;
  releaseAt: string | null;
  releasedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface ScheduleItem {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  amount: number;
  releaseAt: string | null;
  createdAt: string;
}

export const payoutTabs = (t: T) => [
  {
    // Escrow HOLD listesi — banka transferi değil. Eski "İşlem Geçmişi" adı
    // ikisini karıştırıyordu; sekme adı artık ne olduğunu söylüyor.
    key: "escrow",
    label: t("admin.finance.payouts.escrowTab"),
    icon: ListBulletIcon,
  },
  {
    key: "transfers",
    label: t("admin.finance.payouts.transfersTab"),
    icon: BanknotesIcon,
  },
  {
    key: "adjustments",
    label: t("admin.finance.payouts.adjustmentsTab"),
    icon: ReceiptRefundIcon,
  },
  {
    key: "schedule",
    label: t("admin.finance.payouts.schedule"),
    icon: CalendarDaysIcon,
  },
];

export const payoutStatusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.common.allStatuses") },
  { value: "held", label: t("admin.finance.payouts.status.held") },
  { value: "released", label: t("admin.finance.payouts.status.released") },
  { value: "cancelled", label: t("admin.finance.payouts.status.cancelled") },
];

/**
 * PayoutTransfer durum filtresi — etiketler TEK kaynaktan (`payoutStatusConfig`,
 * rozetle aynı) türetilir; ayrı bir çeviri listesi tutulmaz.
 */
export const transferStatusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.common.allStatuses") },
  ...Object.entries(payoutStatusConfig).map(([value, cfg]) => ({
    value,
    label: cfg.label,
  })),
];

export const adjustmentStatusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.common.allStatuses") },
  { value: "open", label: t("admin.finance.payouts.adjustmentStatus.open") },
  {
    value: "settled",
    label: t("admin.finance.payouts.adjustmentStatus.settled"),
  },
];
