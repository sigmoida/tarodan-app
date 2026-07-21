import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface User {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  isSeller: boolean;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: string;
  lastLoginAt?: string;
  membershipTier?: string;
  ordersCount: number;
  productsCount: number;
  tradesCount: number;
  cancellationsCount: number;
  refundsCount: number;
}

/** Normalize the varied user payload into the User shape. */
export function mapUsers(raw: any[]): User[] {
  return raw.map((u: any) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName ?? u.email?.split("@")[0] ?? "-",
    phone: u.phone,
    isSeller: u.isSeller,
    isVerified: u.isVerified,
    isBanned: Boolean(u.isBanned),
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    membershipTier: u.membership?.tier?.type ?? "free",
    ordersCount: (u._count?.buyerOrders ?? 0) + (u._count?.sellerOrders ?? 0),
    productsCount: u._count?.products ?? 0,
    tradesCount:
      (u._count?.initiatedTrades ?? 0) + (u._count?.receivedTrades ?? 0),
    cancellationsCount: u.cancelledOrdersCount ?? 0,
    refundsCount: u._count?.refundRequests ?? 0,
  }));
}

/** list ↔ AI Denetim tabs. */
export const getUserTabs = (t: T) => [
  { key: "list", label: t("admin.users.title") },
  { key: "ai", label: t("admin.catalog.common.aiModeration") },
];

export const getUserFilterOptions = (t: T) => [
  { value: "all", label: t("admin.users.filterAll") },
  { value: "sellers", label: t("admin.users.filterSellers") },
  { value: "buyers", label: t("admin.users.filterBuyers") },
  { value: "banned", label: t("admin.users.filterBanned") },
];

/** Map the "filter" chip to getUsers query flags. */
export function userFilterParams(filter?: string) {
  return {
    isSeller:
      filter === "sellers" ? true : filter === "buyers" ? false : undefined,
    isBanned: filter === "banned" ? true : undefined,
  };
}
