import { useTranslations } from "next-intl";
import {
  ACCOUNT_STATUSES,
  type AccountStatus,
  type LoginState,
} from "@tarodan/types";
import { accountStatusConfig } from "@tarodan/shared";
import { statusLabel } from "@/lib/statusLabels";

type T = ReturnType<typeof useTranslations<never>>;

export interface User {
  id: string;
  adminCode: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  phone?: string;
  isSeller: boolean;
  isVerified: boolean;
  isEmailVerified: boolean;
  isBanned: boolean;
  /** Sunucuda türetilir (deletedAt / isBanned / isEmailVerified). */
  accountStatus: AccountStatus;
  createdAt: string;
  lastLoginAt?: string;
  membershipTier?: string;
  membershipStatus?: string;
  membershipEndsAt?: string;
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
    adminCode: u.adminCode,
    email: u.email,
    displayName: u.displayName ?? u.email?.split("@")[0] ?? "-",
    avatarUrl: u.avatarUrl,
    phone: u.phone,
    isSeller: u.isSeller,
    isVerified: u.isVerified,
    isEmailVerified: Boolean(u.isEmailVerified),
    isBanned: Boolean(u.isBanned),
    accountStatus: u.accountStatus,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    membershipTier: u.membership?.tier?.type ?? "free",
    membershipStatus: u.membership?.status,
    membershipEndsAt: u.membership?.currentPeriodEnd ?? undefined,
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
];

/** Map the "filter" (user type) chip to the getUsers isSeller flag. */
export function userFilterParams(filter?: string) {
  return {
    isSeller:
      filter === "sellers" ? true : filter === "buyers" ? false : undefined,
  };
}

/**
 * Giriş durumu filtresi. "Hiç giriş yapmadı" tablodaki Son Giriş sütununun
 * boş hâliyle aynı şeyi söyler (`admin.users.neverLoggedIn` etiketi ortak) —
 * kayıt olup hesabını hiç kullanmayanları ayıklamak için.
 */
export const getLoginStateFilterOptions = (t: T) => [
  { value: "all", label: t("admin.users.filterLoginStateAll") },
  { value: "never", label: t("admin.users.neverLoggedIn") },
  { value: "logged_in", label: t("admin.users.filterLoggedIn") },
];

/** Giriş durumu çipini getUsers sorgusuna çevirir ("all" → filtre yok). */
export function loginStateParams(state?: string) {
  return state && state !== "all" ? { loginState: state as LoginState } : {};
}

/** Hesap durumu filtresi: Tüm Durumlar + türetilmiş her durum (etiketler tek haritadan). */
export const getAccountStatusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.users.filterAccountStatusAll") },
  ...ACCOUNT_STATUSES.map((value) => ({
    value,
    label: statusLabel(accountStatusConfig, value, t),
  })),
];

/**
 * Map the account-status chip to a getUsers query param ("all" → varsayılan:
 * silinmişler gizli).
 *
 * `filter=banned` ESKİ değer: "Engelliler" kullanıcı-türü seçeneğiydi, artık
 * hesap durumu filtresinde. Liste `syncUrl` olduğu için kaydedilmiş bir
 * `?filter=banned` bağlantısı hâlâ gelebilir; eşlemezsek sessizce TÜM
 * kullanıcıları gösterirdi.
 */
export function accountStatusParams(status?: string, legacyFilter?: string) {
  const resolved =
    status && status !== "all"
      ? status
      : legacyFilter === "banned"
        ? "banned"
        : undefined;
  return resolved ? { accountStatus: resolved } : {};
}

/** Membership tier filter options (Tüm Katmanlar + each tier). */
export const getMembershipTierFilterOptions = (t: T) => [
  { value: "all", label: t("admin.users.filterTierAll") },
  { value: "free", label: t("admin.users.membershipFree") },
  { value: "basic", label: t("admin.users.membershipBasic") },
  { value: "premium", label: "Premium" },
  { value: "business", label: "Business" },
];

/** Membership lifecycle filter options (expiring soon / cancelled). */
export const getMembershipLifecycleOptions = (t: T) => [
  { value: "all", label: t("admin.users.filterLifecycleAll") },
  { value: "expiring7", label: t("admin.users.filterExpiring7") },
  { value: "expiring30", label: t("admin.users.filterExpiring30") },
  { value: "cancelled", label: t("admin.users.filterCancelled") },
];

/** Map the membership-tier chip to a getUsers query param ("all" → no filter). */
export function membershipTierParams(tier?: string) {
  return tier && tier !== "all" ? { membershipTier: tier } : {};
}

/** Map the lifecycle chip to getUsers query params ("expiring soon" / cancelled). */
export function membershipLifecycleParams(lifecycle?: string) {
  if (lifecycle === "expiring7") return { expiringInDays: 7 };
  if (lifecycle === "expiring30") return { expiringInDays: 30 };
  if (lifecycle === "cancelled") return { membershipStatus: "cancelled" };
  return {};
}
