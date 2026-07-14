"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { mapFilterToApiStatus } from "../_lib/types";

/**
 * Page-level header subtitle — live total (respecting the active status filter),
 * phrased per filter. Reads state from the URL so it lives in the page-level
 * PageHeader, outside the ResourceList/SuspenseBoundary.
 */
export function MessagesSummary() {
  const searchParams = useSearchParams();
  const search = searchParams.get("q") ?? "";
  // Default filter is "pending" (initialFilters) — cleared from the URL when active.
  const status = searchParams.get("status") ?? "pending";

  const { data: total } = useQuery({
    queryKey: adminKeys.count("messages", { search, status }),
    queryFn: async () => {
      const res = await adminApi.getMessages({
        page: 1,
        limit: 1,
        ...(search ? { search } : {}),
        status: mapFilterToApiStatus(status),
      });
      const root = (res.data ?? {}) as any;
      return (root.meta?.total ?? root.total ?? 0) as number;
    },
    staleTime: 30_000,
  });

  const t = total ?? 0;
  if (status === "approved") return <>{t} onaylanmış mesaj</>;
  if (status === "rejected") return <>{t} reddedilen mesaj</>;
  if (status === "all") return <>Toplam {t} mesaj</>;
  return (
    <>
      {t} mesaj onay bekliyor — bekleyen mesajları onaylayın, reddedin veya
      göndereni yasaklayın
    </>
  );
}
