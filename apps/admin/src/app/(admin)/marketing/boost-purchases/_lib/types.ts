import type { BoostSource, BoostStatus } from "@tarodan/types";
import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";
import { STATUS_TONE } from "@/lib/status-tone";

type T = ReturnType<typeof useTranslations<never>>;

/** A staff member on a boost (who granted or stopped it). */
export interface StaffRef {
  id: string;
  name: string;
}

/** One row of `GET /admin/ad-packages/purchases` (and the detail). */
export interface BoostPurchase {
  id: string;
  buyer: {
    id: string;
    adminCode: string;
    username: string;
    name: string;
    email: string;
    avatarUrl?: string;
  } | null;
  product: { id: string; title: string; status: string } | null;
  packageName: string | null;
  showcaseOnHome: boolean;
  durationDays: number;
  extendedDays: number;
  /** What the seller paid (0 for a free grant). */
  price: number;
  status: BoostStatus;
  startsAt: string | null;
  endsAt: string | null;
  pausedAt: string | null;
  purchasedAt: string | null;
  remainingSeconds: number;
  showcaseEndsAt: string | null;
  /** `purchase`, or a free `admin_grant` (no order, payment or invoice). */
  source: BoostSource;
  grantedBy: StaffRef | null;
  grantReason: string | null;
  cancelledAt: string | null;
  cancelledBy: StaffRef | null;
  cancelReason: string | null;
  refundedAmount: number;
  /**
   * The most "refund and stop" may return now: the refund modal's maximum
   * and default. 0 when the boost cannot be refunded.
   */
  refundableAmount: number;
  orderId: string | null;
  orderNumber: string | null;
  paymentId: string | null;
  metrics: {
    before: BoostMetricValues | null;
    current: BoostMetricValues;
    gain: BoostMetricValues | null;
    performanceScore: number | null;
  };
  isBestForBuyer: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BoostMetricValues {
  views: number;
  likes: number;
  clicks: number;
}

export const purchaseStatusConfig = (
  t: T,
): Record<BoostStatus, StatusConfig> => ({
  pending: {
    label: t("admin.marketing.boostPurchases.status.pending"),
    variant: STATUS_TONE.pending,
  },
  active: {
    label: t("admin.marketing.boostPurchases.status.active"),
    variant: STATUS_TONE.live,
  },
  paused: {
    label: t("admin.marketing.boostPurchases.status.paused"),
    variant: STATUS_TONE.ended,
  },
  expired: {
    label: t("admin.marketing.boostPurchases.status.expired"),
    variant: STATUS_TONE.ended,
  },
  cancelled: {
    label: t("admin.marketing.boostPurchases.status.cancelled"),
    variant: STATUS_TONE.failed,
  },
  failed: {
    label: t("admin.marketing.boostPurchases.status.failed"),
    variant: STATUS_TONE.failed,
  },
});

/** Where a boost came from. Both are neutral; the label tells them apart. */
export const purchaseSourceConfig = (
  t: T,
): Record<BoostSource, StatusConfig> => ({
  purchase: {
    label: t("admin.marketing.boostPurchases.source.purchase"),
    variant: STATUS_TONE.inactive,
  },
  admin_grant: {
    label: t("admin.marketing.boostPurchases.source.adminGrant"),
    variant: STATUS_TONE.inactive,
  },
});

export const statusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.marketing.boostPurchases.allStatuses") },
  { value: "active", label: t("admin.marketing.boostPurchases.status.active") },
  { value: "paused", label: t("admin.marketing.boostPurchases.status.paused") },
  {
    value: "pending",
    label: t("admin.marketing.boostPurchases.status.pending"),
  },
  {
    value: "expired",
    label: t("admin.marketing.boostPurchases.status.expired"),
  },
  {
    value: "cancelled",
    label: t("admin.marketing.boostPurchases.status.cancelled"),
  },
  { value: "failed", label: t("admin.marketing.boostPurchases.status.failed") },
];

export const sourceFilterOptions = (t: T) => [
  { value: "all", label: t("admin.marketing.boostPurchases.allSources") },
  {
    value: "purchase",
    label: t("admin.marketing.boostPurchases.source.purchase"),
  },
  {
    value: "admin_grant",
    label: t("admin.marketing.boostPurchases.source.adminGrant"),
  },
];
