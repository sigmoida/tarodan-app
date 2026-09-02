import type { StatusConfig } from "@tarodan/ui";
import type { AccountStatus } from "@tarodan/types";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface UserProduct {
  id: string;
  title: string;
  /** Kampanya alanları (originalPrice/salePrice/isOnSale) burada tanımlıydı ama
   * bu uç onları hiç döndürmüyor; ekran da yalnız `price` kullanıyor. */
  price: number;
  status: string;
  createdAt: string;
  imageUrl?: string;
}

export interface UserOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  commissionAmount: number;
  status: string;
  createdAt: string;
  role: "buyer" | "seller";
  otherParty: { id: string; displayName: string };
  product?: { id: string; title: string };
}

export interface UserTrade {
  id: string;
  tradeNumber?: string;
  status: string;
  createdAt: string;
  role: "initiator" | "receiver";
  cashAmount?: number;
  initiator?: { id: string; displayName: string };
  receiver?: { id: string; displayName: string };
  initiatorItems: Array<{ product: { id: string; title: string } }>;
  receiverItems: Array<{ product: { id: string; title: string } }>;
}

export interface UserRatingItem {
  id: string;
  score: number;
  comment?: string;
  createdAt: string;
  giver?: { id: string; displayName: string };
  receiver?: { id: string; displayName: string };
}

/** Engelleme satırı (admin görünümü): karşı tarafın public kimliği + gerekçe. */
export interface UserBlockItem {
  id: string;
  reason?: string | null;
  createdAt: string;
  blocked?: { id: string; displayName: string; username?: string | null };
  blocker?: { id: string; displayName: string; username?: string | null };
}

export interface UserDetail {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  isSeller: boolean;
  isVerified: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isBanned: boolean;
  deletedAt?: string | null;
  /** Sunucuda türetilir (deletedAt / isBanned / isEmailVerified). */
  accountStatus: AccountStatus;
  /** Personel hesabı (AdminUser satırı); kullanıcı aksiyonları kapalı. */
  staff?: { role: string; isActive: boolean } | null;
  bannedAt?: string;
  bannedReason?: string;
  sellerType?: string;
  companyName?: string;
  taxId?: string;
  bankAccount?: {
    accountHolder: string;
    iban: string;
    tcKimlikNo?: string | null;
    taxId?: string | null;
    isVerified: boolean;
    verifiedAt?: string | null;
  } | null;
  membership?: {
    tier: { name: string; type: string };
    status: string;
    startDate: string;
    endDate?: string;
    autoRenew?: boolean;
    cancelledAt?: string | null;
    scheduledTierType?: string | null;
    scheduledBillingPeriod?: string | null;
  };
  createdAt: string;
  lastLoginAt?: string;
  lastActivityAt?: string;
  averageRating?: number;
  addresses?: Array<{
    id: string;
    title: string;
    fullAddress: string;
    city: string;
    district: string;
    postalCode?: string;
    isDefault: boolean;
  }>;
  products?: UserProduct[];
  recentOrders?: UserOrder[];
  recentTrades?: UserTrade[];
  givenRatings?: UserRatingItem[];
  receivedRatings?: UserRatingItem[];
  blocksGiven?: UserBlockItem[];
  blocksReceived?: UserBlockItem[];
  stats?: {
    productsCount: number;
    ordersCount: number;
    buyerOrdersCount: number;
    sellerOrdersCount: number;
    tradesCount: number;
    initiatedTradesCount: number;
    receivedTradesCount: number;
    messagesCount: number;
    sentMessagesCount: number;
    receivedMessagesCount: number;
    givenRatingsCount: number;
    receivedRatingsCount: number;
    blocksGivenCount?: number;
    blocksReceivedCount?: number;
  };
}

/** Order/product/trade status → badge, shared across the activity tabs. */
export const getUserStatusConfig = (t: T): Record<string, StatusConfig> => ({
  pending: { label: t("admin.users.status.pending"), variant: "warning" },
  pending_payment: {
    label: t("admin.operations.orders.status.pendingPayment"),
    variant: "warning",
  },
  paid: { label: t("admin.operations.orders.status.paid"), variant: "info" },
  preparing: {
    label: t("admin.operations.orders.status.preparing"),
    variant: "info",
  },
  shipped: {
    label: t("admin.operations.orders.status.shipped"),
    variant: "primary",
  },
  delivered: {
    label: t("admin.operations.orders.status.delivered"),
    variant: "success",
  },
  completed: {
    label: t("admin.operations.orders.status.completed"),
    variant: "success",
  },
  cancelled: {
    label: t("admin.operations.orders.status.cancelled"),
    variant: "danger",
  },
  rejected: { label: t("common.rejected"), variant: "danger" },
  active: { label: t("common.active"), variant: "success" },
  inactive: { label: t("common.inactive"), variant: "secondary" },
  sold: { label: t("admin.catalog.products.statusSold"), variant: "primary" },
  accepted: {
    label: t("admin.operations.trades.timeline.accepted"),
    variant: "info",
  },
  both_shipped: {
    label: t("admin.users.status.bothShipped"),
    variant: "primary",
  },
  disputed: { label: t("admin.operations.trades.disputed"), variant: "danger" },
});

export const getMembershipTierOptions = (t: T) => [
  { value: "free", label: t("admin.users.membershipFree") },
  { value: "basic", label: t("admin.users.membershipBasic") },
  { value: "premium", label: "Premium" },
  { value: "business", label: "Business" },
];

export const getBillingPeriodOptions = (t: T) => [
  { value: "monthly", label: t("admin.users.billingMonthly") },
  { value: "yearly", label: t("admin.users.billingYearly") },
];
