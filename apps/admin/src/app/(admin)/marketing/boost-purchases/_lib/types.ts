import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface BoostPurchase {
  id: string;
  buyer: { id: string; name: string; email: string } | null;
  product: { id: string; title: string } | null;
  packageName: string | null;
  showcaseOnHome: boolean;
  durationDays: number;
  price: number;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  purchasedAt: string | null;
  createdAt: string;
}

export const purchaseStatusConfig = (t: T): Record<string, StatusConfig> => ({
  pending: {
    label: t("admin.marketing.boostPurchases.status.pending"),
    variant: "warning",
  },
  active: {
    label: t("admin.marketing.boostPurchases.status.active"),
    variant: "success",
  },
  expired: {
    label: t("admin.marketing.boostPurchases.status.expired"),
    variant: "secondary",
  },
  cancelled: {
    label: t("admin.marketing.boostPurchases.status.cancelled"),
    variant: "secondary",
  },
  failed: {
    label: t("admin.marketing.boostPurchases.status.failed"),
    variant: "danger",
  },
});

export const statusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.marketing.boostPurchases.allStatuses") },
  { value: "active", label: t("admin.marketing.boostPurchases.status.active") },
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
