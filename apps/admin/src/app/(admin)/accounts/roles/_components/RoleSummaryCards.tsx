"use client";

import { useTranslations } from "next-intl";
import { MetricCard } from "@/components/MetricCard";
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
          <MetricCard
            key={role}
            label={meta.label}
            value={count}
            footer={
              <div className="space-y-1">
                <p className="text-xs leading-relaxed text-muted">
                  {meta.description}
                </p>
                {role === "super_admin" && (
                  <p className="text-xs text-subtle">
                    {t("admin.roles.lockedCannotChange")}
                  </p>
                )}
              </div>
            }
          />
        );
      })}
    </div>
  );
}
