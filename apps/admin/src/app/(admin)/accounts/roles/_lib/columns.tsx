import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, type RowActionItem } from "@/components/table";
import { getRoleMeta, ROLE_BADGE_VARIANT, type RoleId } from "./constants";
import type { StaffItem } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Staff user table columns. Takes the live `permissions` map (role → permission
 * list) for the permission count; the row menu comes from the caller.
 */
export function staffColumns(
  t: T,
  permissions: Record<string, string[]>,
  rowMenu: (s: StaffItem) => RowActionItem[],
) {
  const roleMeta = getRoleMeta(t);
  return [
    col.text<StaffItem>(t("common.user"), "name"),
    col.muted<StaffItem>(t("common.email"), "email"),
    col.badge<StaffItem>(
      t("admin.roles.columns.role"),
      (s) => (
        <Badge variant={ROLE_BADGE_VARIANT[s.role as RoleId] ?? "default"}>
          {roleMeta[s.role as RoleId]?.label ?? s.role}
        </Badge>
      ),
      { sortKey: "role", sortType: "text" },
    ),
    col.muted<StaffItem>(t("admin.roles.columns.permissionCount"), (s) =>
      s.role === "super_admin"
        ? t("admin.roles.allLockedLabel")
        : t("admin.roles.permissionCountLabel", {
            count: (permissions[s.role] ?? []).length,
          }),
    ),
    col.badge<StaffItem>(
      t("common.status"),
      (s) => <Badge active={s.isActive} />,
      {
        sortKey: "isActive",
        sortType: "number",
      },
    ),
    col.date<StaffItem>(t("admin.roles.columns.lastLogin"), "lastLoginAt"),
    col.rowMenu<StaffItem>(rowMenu),
  ];
}
