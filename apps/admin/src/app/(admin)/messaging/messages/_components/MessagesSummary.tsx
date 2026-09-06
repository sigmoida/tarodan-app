"use client";

import { useSearchParams } from "next/navigation";
import { AsyncValue } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useListTotal } from "@/hooks/useListTotal";
import { mapFilterToApiStatus } from "../_lib/types";
import { useTranslations } from "next-intl";

/**
 * Page-level header subtitle — live total (respecting the active status filter),
 * phrased per filter. Reads state from the URL so it lives in the page-level
 * PageHeader, outside the ResourceList/SuspenseBoundary.
 */
export function MessagesSummary() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const search = searchParams.get("q") ?? "";
  // Default filter is "pending" (initialFilters) — cleared from the URL when active.
  const status = searchParams.get("status") ?? "pending";

  const { data: total, isLoading } = useListTotal(
    "messages",
    { ...(search ? { search } : {}), status: mapFilterToApiStatus(status) },
    adminApi.getMessages,
  );

  const count = <AsyncValue loading={isLoading}>{total ?? 0}</AsyncValue>;
  if (status === "approved")
    return (
      <>
        {count} {t("admin.messaging.messages.summary.approved")}
      </>
    );
  if (status === "rejected")
    return (
      <>
        {count} {t("admin.messaging.messages.summary.rejected")}
      </>
    );
  if (status === "all")
    return (
      <>
        {t("common.total")} {count}{" "}
        {t("admin.messaging.messages.summary.message")}
      </>
    );
  return (
    <>
      {count} {t("admin.messaging.messages.summary.pending")}
    </>
  );
}
