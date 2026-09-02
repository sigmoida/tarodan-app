"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AsyncValue } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { accountStatusParams, userFilterParams } from "../_lib/types";

/**
 * Page-level header subtitle — live total respecting the active URL filters, so
 * it lives in the stable page-level PageHeader (outside the list boundary).
 */
export function UsersSummary() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const filter = searchParams.get("filter") ?? "all";
  // Hesap durumu listeyi daraltıyor; toplam da aynı daralmayı görmeli, aksi
  // halde "Silinmiş" filtresinde başlık tüm kullanıcıları sayıyordu.
  const accountStatus = searchParams.get("accountStatus") ?? "all";

  const { data: total, isLoading } = useQuery({
    queryKey: adminKeys.count("users", { search, filter, accountStatus }),
    queryFn: async () => {
      const res = await adminApi.getUsers({
        page: 1,
        limit: 1,
        ...(search ? { search } : {}),
        ...userFilterParams(filter),
        ...accountStatusParams(accountStatus, filter),
      });
      const root = (res.data ?? {}) as any;
      return (root.meta?.total ?? root.total ?? 0) as number;
    },
    staleTime: 30_000,
  });

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
