import {
  Badge,
  StatusBadge,
  enumLabel,
  membershipTierConfig,
  subscriptionStatusConfig,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, type RowActionItem } from "@/components/table";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { User } from "./types";
import { statusConfig } from "@/lib/statusLabels";

type T = ReturnType<typeof useTranslations<never>>;

// Hesap durumu sekmeden bellidir (deriveAccountStatus); kullanıcı türü
// (alıcı/satıcı) yalnız "ilan açmış mı" bayrağıdır ve listede gösterilmez.
export function userColumns(t: T, rowMenu: (u: User) => RowActionItem[]) {
  return [
    col.code<User>(t("admin.users.userId"), (u) => u.adminCode, {
      minWidth: 130,
      sortKey: "adminCode",
      sortType: "text",
    }),
    col.user<User>(
      t("admin.users.columnUser"),
      (u) => ({
        name: u.displayName,
        secondary: u.email,
        avatar: u.avatarUrl,
        href: `/accounts/users/${u.id}`,
      }),
      { minWidth: 520, sortKey: "displayName", sortType: "text" },
    ),
    col.badge<User>(
      t("admin.users.membership"),
      (u) => {
        const tier = (u.membershipTier || "").toLowerCase();
        const label = enumLabel(
          statusConfig(membershipTierConfig, t),
          tier,
          u.membershipTier || t("admin.users.membershipFree"),
        );
        return (
          <Badge variant={tier === "premium" ? "warning" : "default"}>
            {label}
          </Badge>
        );
      },
      { sortKey: "membership.tier.type", sortType: "text" },
    ),
    col.custom<User>(
      t("admin.users.membershipStatus"),
      (u) =>
        u.membershipStatus && (u.membershipTier || "free") !== "free" ? (
          <StatusBadge
            status={u.membershipStatus}
            config={statusConfig(subscriptionStatusConfig, t)}
          />
        ) : (
          <Badge variant="default">{t("admin.users.membershipFree")}</Badge>
        ),
      {
        grow: 1,
        minWidth: 120,
        sortKey: "membership.status",
        sortType: "text",
      },
    ),
    col.custom<User>(
      t("admin.users.membershipEndsAt"),
      (u) => {
        if ((u.membershipTier || "free") === "free" || !u.membershipEndsAt) {
          return <span className="text-muted">—</span>;
        }
        const end = new Date(u.membershipEndsAt);
        const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
        const tone =
          daysLeft < 0
            ? "text-danger-600"
            : daysLeft <= 7
              ? "text-warning-700"
              : "text-body";
        return (
          <span className={`whitespace-nowrap tabular-nums ${tone}`}>
            {fmtDate(end)}
            {daysLeft >= 0 && daysLeft <= 7 && (
              <span className="ml-1 text-xs">
                ({t("admin.users.membershipDaysLeft", { count: daysLeft })})
              </span>
            )}
          </span>
        );
      },
      {
        grow: 1,
        minWidth: 140,
        sortKey: "membership.currentPeriodEnd",
        sortType: "date",
      },
    ),
    col.number<User>(t("admin.operations.common.order"), (u) => u.ordersCount, {
      sortKey: "ordersCount",
    }),
    col.number<User>(
      t("admin.catalog.common.product"),
      (u) => u.productsCount,
      { sortKey: "productsCount" },
    ),
    col.number<User>(t("admin.users.tradesCount"), (u) => u.tradesCount),
    col.number<User>(
      t("admin.users.cancellationsCount"),
      (u) => u.cancellationsCount,
    ),
    col.number<User>(t("admin.users.refundsCount"), (u) => u.refundsCount),
    col.date<User>(t("admin.users.registeredAt"), "createdAt"),
    col.muted<User>(
      t("admin.users.lastLogin"),
      (u) =>
        u.lastLoginAt
          ? fmtDateTime(u.lastLoginAt)
          : t("admin.users.neverLoggedIn"),
      { minWidth: 180, sortKey: "lastLoginAt", sortType: "date" },
    ),
    col.rowMenu<User>(rowMenu),
  ];
}
