"use client";

import { LockClosedIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Card } from "@tarodan/ui";
import { ROLES, getRoleMeta } from "../_lib/constants";

/**
 * The three role description cards above the matrix. `permissions` supplies the
 * live per-role permission count (Super Admin is always "Tümü"). Neutral by
 * design — the cards describe roles, they don't signal status.
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
          <Card key={role} variant="bordered" className="px-4 py-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-heading">
                {role === "super_admin" && (
                  <LockClosedIcon className="h-3.5 w-3.5 text-subtle" />
                )}
                {meta.label}
              </span>
              <span className="font-mono text-xs text-muted">{count}</span>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              {meta.description}
            </p>
            {role === "super_admin" && (
              <p className="mt-2 text-xs text-subtle">
                {t("admin.roles.lockedCannotChange")}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
