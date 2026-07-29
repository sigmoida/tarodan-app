"use client";

import { useQuery } from "@tanstack/react-query";
import {
  TicketIcon,
  CheckCircleIcon,
  TagIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { MetricCard } from "@/components/MetricCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { type Discount } from "../_lib/types";
import { useTranslations } from "next-intl";

/**
 * Summary metrics across all discounts. Keyed under `['discounts','stats']` —
 * discount mutations (`invalidates: ['discounts']`) refresh this too.
 */
export function DiscountsStats() {
  const t = useTranslations();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: adminKeys.stats("discounts"),
    queryFn: async () => {
      const res = await adminApi.get("/admin/discounts", {
        params: { limit: 500 },
      });
      const list: Discount[] = res.data?.items ?? res.data?.data ?? [];
      const total = res.data?.total ?? res.data?.meta?.total ?? list.length;
      return {
        total,
        active: list.filter((d) => d.isCurrentlyValid).length,
        coupons: list.filter((d) => d.code).length,
        auto: list.filter((d) => !d.code).length,
      };
    },
    staleTime: 30_000,
  });

  const s = data ?? { total: 0, active: 0, coupons: 0, auto: 0 };

  if (isError) {
    return (
      <QueryErrorCard onRetry={() => void refetch()} isRetrying={isFetching} />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <MetricCard
        icon={TicketIcon}
        tone="info"
        label={t("admin.marketing.discounts.totalDiscounts")}
        value={s.total}
        footer={
          <span className="text-success-700">
            {t("admin.marketing.discounts.activeCount", { count: s.active })}
          </span>
        }
        loading={isLoading}
      />
      <MetricCard
        icon={CheckCircleIcon}
        tone="success"
        label={t("common.active")}
        value={s.active}
        loading={isLoading}
      />
      <MetricCard
        icon={TagIcon}
        tone="info"
        label={t("admin.marketing.discounts.couponCodes")}
        value={s.coupons}
        loading={isLoading}
      />
      <MetricCard
        icon={SparklesIcon}
        tone="primary"
        label={t("admin.marketing.discounts.automaticCampaigns")}
        value={s.auto}
        loading={isLoading}
      />
    </div>
  );
}
