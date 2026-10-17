import { membershipTierConfig } from "@tarodan/ui";
import type { AccountStatus } from "@tarodan/types";
import type { useTranslations } from "next-intl";
import { statusConfig } from "@/lib/statusLabels";

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

/** Üyelik paketi rozeti: paylaşılan `membershipTierConfig`'in çözülmüş hâli. */
export const membershipConfig = (t: T) => statusConfig(membershipTierConfig, t);
