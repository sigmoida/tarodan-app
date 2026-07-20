"use client";

import { useQuery } from "@tanstack/react-query";
import {
  MegaphoneIcon,
  CursorArrowRaysIcon,
  EyeIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { MetricCard } from "@/components/MetricCard";
import { type Ad } from "../_lib/types";

/** Summary metrics over ALL ads. Keyed under ['ads'] so ad mutations refresh it. */
export function AdsStats() {
  const { data, isLoading } = useQuery({
    queryKey: adminKeys.stats("ads"),
    queryFn: async () => {
      const res = await adminApi.getAds();
      const ads: Ad[] = Array.isArray(res.data)
        ? res.data
        : ((res.data as any)?.data ?? []);
      const clicks = ads.reduce((s, a) => s + (a.clickCount || 0), 0);
      const impressions = ads.reduce((s, a) => s + (a.impressionCount || 0), 0);
      return {
        total: ads.length,
        active: ads.filter((a) => a.isActive).length,
        clicks,
        impressions,
        ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : "0",
      };
    },
    staleTime: 30_000,
  });

  const s = data ?? {
    total: 0,
    active: 0,
    clicks: 0,
    impressions: 0,
    ctr: "0",
  };

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <MetricCard
        icon={MegaphoneIcon}
        tone="info"
        label="Toplam Reklam"
        value={s.total}
        footer={<span className="text-success-700">{s.active} aktif</span>}
        loading={isLoading}
      />
      <MetricCard
        icon={CursorArrowRaysIcon}
        tone="primary"
        label="Toplam Tıklama"
        value={s.clicks.toLocaleString()}
        loading={isLoading}
      />
      <MetricCard
        icon={EyeIcon}
        tone="success"
        label="Görüntülenme"
        value={s.impressions.toLocaleString()}
        loading={isLoading}
      />
      <MetricCard
        icon={ChartBarIcon}
        tone="primary"
        label="Ortalama CTR"
        value={`${s.ctr}%`}
        loading={isLoading}
      />
    </div>
  );
}
