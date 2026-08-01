"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { extractList } from "@/lib/extract";
import { adminKeys } from "@/lib/query/keys";
import { clientListFetcher } from "@/lib/query/client-list";
import { useResourceList } from "@/components/list";
import { readSetting } from "@/lib/settings";
import { type MembershipTier } from "./types";

export const membershipTiersFetcher = clientListFetcher<MembershipTier>(
  () => adminApi.getMembershipTiers(),
  (raw) => extractList<MembershipTier>(raw),
  // No searchFields → full-content search across all displayed columns (#378).
);

function parseYearlyDiscount(raw: unknown): number {
  const value = readSetting(raw, "yearly_discount_percentage");
  const parsed = value != null ? parseFloat(value) : NaN;
  return Number.isNaN(parsed) ? 20 : parsed;
}

export function useMembershipTiersPage() {
  const { rows } = useResourceList<MembershipTier>();
  const [editing, setEditing] = useState<MembershipTier | null>(null);
  const yearlyDiscountQuery = useQuery({
    queryKey: adminKeys.all("membership-yearly-discount"),
    queryFn: async () => {
      const response = await adminApi.getSettings();
      return parseYearlyDiscount(response.data?.data ?? response.data ?? []);
    },
  });

  return {
    rows,
    // null = okunamadı. Varsayılana (20) düşmek TEHLİKELİ: düzenleme modalı
    // yıllık fiyatı bu orandan hesaplayıp payload'a yazıyor, yani uydurulmuş
    // bir oran yanlış fiyatı KALICI hale getirirdi. Okunamadığında türetilen
    // değerler "—" gösterilir ve düzenleme kapatılır.
    yearlyDiscount: yearlyDiscountQuery.data ?? null,
    yearlyDiscountLoading: yearlyDiscountQuery.isLoading,
    yearlyDiscountError: yearlyDiscountQuery.isError,
    yearlyDiscountRetrying: yearlyDiscountQuery.isRefetching,
    retryYearlyDiscount: yearlyDiscountQuery.refetch,
    editing,
    setEditing,
  };
}
