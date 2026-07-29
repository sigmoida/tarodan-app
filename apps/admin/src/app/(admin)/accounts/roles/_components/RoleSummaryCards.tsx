"use client";

import { LockClosedIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { ROLES, getRoleMeta } from "../_lib/constants";

/**
 * The three role description cards above the matrix. `permissions` supplies the
 * live per-role permission count (Super Admin is always "Tümü").
 */
export function RoleSummaryCards({
  permissions,
}: {
  permissions: Record<string, string[]>;
}) {
  const t = useTranslations();
  const roleMeta = getRoleMeta(t);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {ROLES.map((role) => {
        const meta = roleMeta[role];
        const count =
          role === "super_admin"
            ? t("admin.roles.allLabel")
            : t("admin.roles.permissionCountLabel", {
                count: (permissions[role] ?? []).length,
              });
        return (
          <div
            key={role}
            className={`rounded-lg border px-4 py-3 ${meta.color}`}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold">{meta.label}</span>
              <span className="font-mono text-xs opacity-70">{count}</span>
            </div>
            <p className="text-xs leading-relaxed opacity-80">
              {meta.description}
            </p>
            {role === "super_admin" && (
              <div className="mt-2 flex items-center gap-1 text-xs opacity-60">
                <LockClosedIcon className="h-3 w-3" />
                {t("admin.roles.lockedCannotChange")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
