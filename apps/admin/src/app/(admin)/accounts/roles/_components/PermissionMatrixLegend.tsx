"use client";

import {
  LockClosedIcon,
  CheckIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";

/** Static legend explaining the matrix cell states. */
export function PermissionMatrixLegend() {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success-500/15">
          <LockClosedIcon className="h-3 w-3 text-success-600" />
        </span>
        {t("admin.roles.legend.superAdmin")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-500/10">
          <CheckIcon className="h-3 w-3 text-primary-600" />
        </span>
        {t("admin.roles.legend.hasPermission")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center">
          <span className="block h-2 w-2 rounded-full bg-border" />
        </span>
        {t("admin.roles.legend.noPermission")}
      </span>
      <span className="flex items-center gap-1.5">
        <InformationCircleIcon className="h-4 w-4 text-muted" />
        {t("admin.roles.legend.hint")}
      </span>
    </div>
  );
}
