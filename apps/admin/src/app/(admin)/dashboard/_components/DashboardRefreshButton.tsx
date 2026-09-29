"use client";

import { useState, useTransition } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { useDashboardRefresh } from "../_lib/useDashboard";

/**
 * The dashboard refreshes on a slow timer (a minute) rather than polling, so
 * this is how an operator says "I just fixed that — recount". It also drops the
 * server-side cache; re-reading a cached body would look like nothing happened.
 */
export function DashboardRefreshButton() {
  const t = useTranslations();
  const refresh = useDashboardRefresh();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const onClick = () => {
    setBusy(true);
    startTransition(() => {
      void refresh().finally(() => setBusy(false));
    });
  };

  const loading = busy || isPending;

  return (
    <Button variant="ghost" size="sm" onClick={onClick} isLoading={loading}>
      <ArrowPathIcon className="mr-1 h-4 w-4" />
      {loading ? t("admin.dashboard.refreshing") : t("admin.dashboard.refresh")}
    </Button>
  );
}
