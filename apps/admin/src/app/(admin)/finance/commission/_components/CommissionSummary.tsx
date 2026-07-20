"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BanknotesIcon,
  UserIcon,
  BuildingStorefrontIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { MetricCard } from "@/components/MetricCard";
import { fmtTry } from "@/lib/format";
import { type CommissionRevenue } from "../_lib/types";
import { useTranslations } from "next-intl";

export function CommissionSummary() {
  const t = useTranslations();
  const { data } = useQuery<CommissionRevenue>({
    queryKey: ["commission-revenue"],
    queryFn: async () => (await adminApi.getCommissionRevenue()).data,
  });

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <MetricCard
        icon={BanknotesIcon}
        tone="success"
        label={t("admin.finance.commission.totalCollected")}
        value={fmtTry(data.totalCommission)}
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
        value={fmtTry(data.totalBuyerFee ?? 0)}
      />
      <MetricCard
        icon={BuildingStorefrontIcon}
        tone="primary"
        label={t("admin.finance.commission.sellerCommission")}
        value={fmtTry(data.totalSellerFee ?? 0)}
      />
    </div>
  );
}
