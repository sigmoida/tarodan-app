"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BanknotesIcon,
  UserIcon,
  BuildingStorefrontIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { MetricCard } from "@/components/MetricCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { fmtTry } from "@/lib/format";
import { type CommissionRevenue } from "../_lib/types";
import { useTranslations } from "next-intl";

export function CommissionSummary() {
  const t = useTranslations();
  const { data, isLoading, isError, isFetching, refetch } =
    useQuery<CommissionRevenue>({
      queryKey: adminKeys.all("commission-revenue"),
      queryFn: async () => (await adminApi.getCommissionRevenue()).data,
    });

  if (isError) {
    return (
      <QueryErrorCard onRetry={() => void refetch()} isRetrying={isFetching} />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <MetricCard
        icon={BanknotesIcon}
        tone="success"
        label={t("admin.finance.commission.totalCollected")}
        value={data ? fmtTry(data.totalCommission) : null}
        loading={isLoading}
        footer={
          <span className="text-muted">
            {t("admin.finance.commission.completedOrders")}
          </span>
        }
      />
      <MetricCard
        icon={UserIcon}
        tone="info"
        label={t("admin.finance.commission.buyerServiceFee")}
        value={data ? fmtTry(data.totalBuyerFee ?? 0) : null}
        loading={isLoading}
      />
      <MetricCard
        icon={BuildingStorefrontIcon}
        tone="primary"
        label={t("admin.finance.commission.sellerCommission")}
        value={data ? fmtTry(data.totalSellerFee ?? 0) : null}
        loading={isLoading}
      />
    </div>
  );
}
