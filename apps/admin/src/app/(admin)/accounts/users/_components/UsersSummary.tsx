"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AsyncValue } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useListTotal } from "@/hooks/useListTotal";
import { accountStatusParams } from "../_lib/types";

/**
 * Page-level header subtitle — live total for the active status tab + search,
 * so it lives in the stable page-level PageHeader (outside the list boundary).
 */
export function UsersSummary() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const search = searchParams.get("q") ?? "";
  // Sekme = hesap durumu; varsayılan sekme URL'ye yazılmaz → "active".
  const accountStatus = searchParams.get("tab") ?? "active";

  const { data: total, isLoading } = useListTotal(
    "users",
    { ...accountStatusParams(accountStatus), ...(search ? { search } : {}) },
    adminApi.getUsers,
  );

  return (
    <>
      {t.rich("admin.users.totalCount", {
        count: total ?? 0,
        value: (chunks) => (
          <AsyncValue loading={isLoading}>{chunks}</AsyncValue>
        ),
      })}
    </>
  );
}
