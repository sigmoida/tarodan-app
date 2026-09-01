import type { StatusConfig } from "@tarodan/ui";
import type { AccountStatus } from "@tarodan/types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface Seller {
  id: string;
  adminCode: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  sellerType: string | null;
  isVerified: boolean;
  isEmailVerified: boolean;
  isBanned: boolean;
  accountStatus: AccountStatus;
  createdAt: string;
  membership?: { tier?: { type?: string; name?: string } };
  cancelledOrdersCount?: number;
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
