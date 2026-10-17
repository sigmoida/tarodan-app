import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";
import { STATUS_TONE } from "@/lib/status-tone";

type T = ReturnType<typeof useTranslations<never>>;

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
  price: number;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  pausedAt: string | null;
  purchasedAt: string | null;
  remainingSeconds: number;
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

export const purchaseStatusConfig = (t: T): Record<string, StatusConfig> => ({
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
