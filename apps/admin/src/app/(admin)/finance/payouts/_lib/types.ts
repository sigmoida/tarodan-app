import { payoutStatusConfig } from "@tarodan/ui";
import type { PayoutManualSettlementMethod } from "@tarodan/types";
import type { useTranslations } from "next-intl";
import type { HoldReleaseFlags } from "./holdReason";

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
    orderNumber: string | null;
  }>;
}

/**
 * The transfer-total snapshot the processor stored when it parked or failed
 * the row (TL): the net does not fit `allowedTotal = min(ownAllowed,
 * oidRemaining)`. `missingInput` = no payment or source to cap against.
 */
export interface PayoutTransferTotal {
  net: number;
  allowedTotal: number;
  ownAllowed: number;
  oidRemaining: number;
  missingInput: "payment" | "source" | null;
}

/**
 * What an admin may do with the row; decided by the API (one policy for the
 * guards and these flags), never recomputed here.
 */
export interface PayoutTransferResolution {
  /** A retry must confirm the PayTR panel check and give a reason. */
  retryRequiresProviderCheck: boolean;
  /** The one way the row may be marked as paid, or null. */
  markPaidMethod: PayoutManualSettlementMethod | null;
  /** The net (TL) the mark-paid request confirms (`expectedNetAmount`). */
  markPaidNetAmount: number | null;
  /** Mark as paid must confirm the PayTR panel check: an earlier send of
   *  this row may have reached PayTR unconfirmed (`confirmProviderChecked`). */
  markPaidRequiresProviderCheck: boolean;
}

/** A completed row an admin marked as paid. */
export interface PayoutManualSettlement {
  method: PayoutManualSettlementMethod;
  reference: string;
  settledAt: string;
  netAmount: number;
  platformFundedAmount: number;
}

/** Gerçek banka transferi satırı (PayoutTransfer). */
export interface PayoutTransferRow {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  tradeCashPaymentId: string | null;
  /** PayTR's transfer reference: what to search the PayTR panel for. */
  transId: string;
  seller: { id: string; displayName: string | null; email: string | null };
  amount: number;
  netAmount: number;
  adjustmentDeduction: number;
  ibanLast4: string;
  status: string;
  /** A `PAYOUT_FAILURE_REASONS` code, or free text (legacy and returned rows). */
  failureReason: string | null;
  retryCount: number;
  processedAt: string | null;
  createdAt: string;
  /** What PayTR took from the payment (0 = settled outside PayTR). */
  submittedTotalAmount: number | null;
  transferTotal: PayoutTransferTotal | null;
  /** PayTR's own message on a rejection. */
  providerMessage: string | null;
  resolution: PayoutTransferResolution;
  manualSettlement: PayoutManualSettlement | null;
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

/** Sunucunun hold satırına eklediği serbest bırakma kararı + sipariş durumu. */
export interface HoldRowServerFlags extends HoldReleaseFlags {
  orderStatus?: string;
}

export interface PayoutTransaction extends HoldRowServerFlags {
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
  refundedAmount: number;
  frozenByRefundId: string | null;
}

export interface ScheduleItem extends HoldRowServerFlags {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  amount: number;
  releaseAt: string | null;
  createdAt: string;
  refundedAmount: number;
  frozenByRefundId: string | null;
}

export const payoutTabs = (t: T) => [
  {
    // Escrow HOLD listesi — banka transferi değil. Eski "İşlem Geçmişi" adı
    // ikisini karıştırıyordu; sekme adı artık ne olduğunu söylüyor.
    key: "escrow",
    label: t("admin.finance.payouts.escrowTab"),
  },
  {
    key: "transfers",
    label: t("admin.finance.payouts.transfersTab"),
  },
  {
    key: "adjustments",
    label: t("admin.finance.payouts.adjustmentsTab"),
  },
  {
    key: "schedule",
    label: t("admin.finance.payouts.schedule"),
  },
];

/** "Vadesi geçmiş" süzgeci — değer API'ye `overdue=true` gider (dashboard uyarısı). */
export const overdueFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.payouts.filterAllDue") },
  { value: "true", label: t("admin.finance.payouts.filterOverdueOnly") },
];

export const payoutStatusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.common.allStatuses") },
  { value: "held", label: t("admin.finance.payouts.status.held") },
  { value: "released", label: t("admin.finance.payouts.status.released") },
  { value: "cancelled", label: t("admin.finance.payouts.status.cancelled") },
];

/** "Erken bırakılanlar" süzgeci — değer API'ye `earlyReleased=true` gider. */
export const earlyReleaseFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.payouts.filterAllReleases") },
  { value: "true", label: t("admin.finance.payouts.filterEarlyOnly") },
];

/**
 * PayoutTransfer durum filtresi — etiketler TEK kaynaktan (`payoutStatusConfig`,
 * rozetle aynı) türetilir; ayrı bir çeviri listesi tutulmaz.
 */
export const transferStatusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.common.allStatuses") },
  ...Object.entries(payoutStatusConfig).map(([value, entry]) => ({
    value,
    label: t(entry.labelKey),
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
