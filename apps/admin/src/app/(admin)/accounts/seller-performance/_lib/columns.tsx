import { Badge, accountStatusConfig } from "@tarodan/ui";
import { col } from "@/components/table";
import { statusConfig } from "@/lib/statusLabels";
import { type Seller, membershipConfig } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export const sellerColumns = (t: T) => [
  col.code<Seller>(t("admin.users.userId"), (s) => s.adminCode, {
    minWidth: 130,
    sortKey: "adminCode",
    sortType: "text",
  }),
  col.user<Seller>(
    t("admin.users.columnUser"),
    (s) => ({
      name: s.displayName,
      secondary: s.email,
      avatar: s.avatarUrl,
      href: `/accounts/users/${s.id}`,
    }),
    { minWidth: 300, sortKey: "displayName" },
  ),
  col.badge<Seller>(
    t("admin.accounts.sellerPerformance.membership"),
    (s) => (
      <Badge
        status={s.membership?.tier?.type ?? "free"}
        config={membershipConfig(t)}
      />
    ),
    { sortKey: "membership.tier.type", sortType: "text" },
  ),
  col.number<Seller>(
    t("admin.accounts.sellerPerformance.products"),
    (s) => s._count.products,
    {
      sortKey: "_count.products",
    },
  ),
  col.number<Seller>(
    t("admin.accounts.sellerPerformance.orders"),
    (s) => s._count.sellerOrders,
    {
      sortKey: "_count.sellerOrders",
    },
  ),
  col.number<Seller>(
    t("admin.users.tradesCount"),
    (s) => (s._count.initiatedTrades ?? 0) + (s._count.receivedTrades ?? 0),
  ),
  col.number<Seller>(
    t("admin.users.cancellationsCount"),
    (s) => s.cancelledOrdersCount ?? 0,
  ),
  col.number<Seller>(
    t("admin.users.refundsCount"),
    (s) => s._count.refundRequests ?? 0,
  ),
  // Kullanıcılar listesiyle aynı türetim (accountStatus); isVerified "Aktif"
  // demek değildi.
  col.badge<Seller>(
    t("common.status"),
    (s) => (
      <Badge
        status={s.accountStatus}
        config={statusConfig(accountStatusConfig, t)}
      />
    ),
    { sortKey: "isEmailVerified", sortType: "number" },
  ),
];
