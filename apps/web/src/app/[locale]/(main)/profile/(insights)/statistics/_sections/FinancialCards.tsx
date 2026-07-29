/** @format */

import {
  ArrowTrendingUpIcon,
  ShoppingCartIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";
import { formatTL } from "@/lib/format";
import { useTranslations } from "next-intl";
import type { UserStats } from "../_lib/types";

/** The two headline money cards: total earned (sales) + total spent (purchases). */
export default function FinancialCards({ stats }: { stats: UserStats }) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-4">
          <div className="rounded-xl bg-surface-alt p-3">
            <ArrowTrendingUpIcon className="h-8 w-8 text-primary-600" />
          </div>
          <div>
            <p className="text-muted">{t("analytics.totalEarnings")}</p>
            <p className="text-4xl font-bold text-heading">
              {formatTL(stats.totalRevenue)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <CheckBadgeIcon className="h-5 w-5" />
          <span>
            {t("analytics.fromSalesCount", { count: stats.salesCount })}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-4">
          <div className="rounded-xl bg-surface-alt p-3">
            <ShoppingCartIcon className="h-8 w-8 text-primary-600" />
          </div>
          <div>
            <p className="text-muted">{t("analytics.totalSpent")}</p>
            <p className="text-4xl font-bold text-heading">
              {formatTL(stats.totalSpent)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <CheckBadgeIcon className="h-5 w-5" />
          <span>
            {t("analytics.fromOrdersCount", { count: stats.purchasesCount })}
          </span>
        </div>
      </div>
    </div>
  );
}
