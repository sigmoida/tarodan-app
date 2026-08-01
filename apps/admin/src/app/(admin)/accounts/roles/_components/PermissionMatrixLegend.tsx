"use client";

import {
  LockClosedIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Checkbox } from "@tarodan/ui";

/**
 * Static legend for the matrix cell states. Renders the SAME `Checkbox` the grid
 * uses (disabled), so the legend can never drift from the real cells.
 */
export function PermissionMatrixLegend() {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <Checkbox checked disabled readOnly />
        {t("admin.roles.legend.hasPermission")}
      </span>
      <span className="flex items-center gap-1.5">
        <Checkbox checked={false} disabled readOnly />
        {t("admin.roles.legend.noPermission")}
      </span>
      <span className="flex items-center gap-1.5">
        <LockClosedIcon className="h-3.5 w-3.5 text-subtle" />
        {t("admin.roles.legend.superAdmin")}
      </span>
      <span className="flex items-center gap-1.5">
        <InformationCircleIcon className="h-4 w-4" />
        {t("admin.roles.legend.hint")}
      </span>
    </div>
  );
}
