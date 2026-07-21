import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface Seller {
  id: string;
  displayName: string;
  email: string;
  sellerType: string | null;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: string;
  membership?: { tier?: { type?: string; name?: string } };
  _count: {
    products: number;
    sellerOrders: number;
    initiatedTrades?: number;
    receivedTrades?: number;
    refundRequests?: number;
  };
}

export const membershipConfig = (t: T): Record<string, StatusConfig> => ({
  business: {
    label: t("admin.accounts.sellerPerformance.memberships.business"),
    variant: "primary",
  },
  premium: {
    label: t("admin.accounts.sellerPerformance.memberships.premium"),
    variant: "success",
  },
  basic: {
    label: t("admin.accounts.sellerPerformance.memberships.basic"),
    variant: "info",
  },
  free: {
    label: t("admin.accounts.sellerPerformance.memberships.free"),
    variant: "secondary",
  },
});
