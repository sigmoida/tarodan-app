/** @format */

"use client";

import { ordersApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";

export interface EstimatedNet {
  sellerFeeAmount: number;
  sellerNetAmount: number;
}

export interface CommissionItem {
  id: string;
  amount: number;
  categoryId?: string | null;
  /**
   * İlanın paket boyutu (small/medium/large). Satıcı kargo payı kademe bazlı
   * olabildiğinden net tahmin, ilanın KENDİ kademesiyle hesaplanmalı —
   * gönderilmezse API küçük paket varsayar.
   */
  packageTier?: string | null;
}

/**
 * Batch seller-net estimation, keyed by item id. Shared by every surface that
 * previews commission (my-listings, received offers, …) so the batch call +
 * signature-based caching live in one place.
 */
export function useCommissionPreviews(
  items: CommissionItem[],
): Record<string, EstimatedNet> {
  const signature = items
    .map(
      (i) => `${i.id}-${i.amount}-${i.categoryId ?? ""}-${i.packageTier ?? ""}`,
    )
    .join(",");

  const query = useWebList<Record<string, EstimatedNet>>({
    resource: "commission-previews",
    params: signature,
    enabled: items.length > 0,
    fetcher: async (): Promise<Record<string, EstimatedNet>> => {
      const res = await ordersApi.getCommissionPreviewBatch(
        items.map((i) => ({
          amount: Number(i.amount),
          categoryId: i.categoryId ?? null,
          packageTier: i.packageTier ?? null,
        })),
      );
      const map: Record<string, EstimatedNet> = {};
      if (Array.isArray(res.data?.results)) {
        items.forEach((it, i) => {
          const r = res.data.results[i];
          if (r != null && typeof r.sellerNetAmount === "number")
            map[it.id] = r;
        });
      }
      return map;
    },
    query: { meta: { page: "commission-previews" } },
  });

  return query.data ?? {};
}
