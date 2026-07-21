import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { type Seller, membershipConfig } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export const sellerColumns = (t: T) => [
  col.user<Seller>(
    t("admin.accounts.sellerPerformance.seller"),
    (s) => ({ name: s.displayName, secondary: s.email }),
    { sortKey: "displayName" },
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
  col.badge<Seller>(
    t("common.status"),
    (s) =>
      s.isBanned ? (
        <Badge variant="danger">
          {t("admin.accounts.sellerPerformance.banned")}
        </Badge>
      ) : s.isVerified ? (
        <Badge variant="success">{t("common.active")}</Badge>
      ) : (
        <Badge variant="warning">
          {t("admin.accounts.sellerPerformance.unverified")}
        </Badge>
      ),
    { sortKey: "isVerified", sortType: "number" },
  ),
];
