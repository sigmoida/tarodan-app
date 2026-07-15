"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@tarodan/ui";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useResourceList } from "@/components/list";

/** Header badges: the review queue (at_warehouse) count + the disputed count. */
export function TradesHeaderActions() {
  const t = useTranslations();
  const { rows, filters, setFilter } = useResourceList<any>();

  // Review queue — a separate small query independent of the current filter.
  const { data } = useQuery({
    queryKey: ["trades-review-queue-count"],
    queryFn: async () => {
      const res = await adminApi.getTrades({
        page: 1,
        limit: 1,
        status: "at_warehouse",
      });
      const meta = res.data?.meta || {};
      const d = res.data?.data || res.data?.trades || [];
      return (meta.total ?? d.length ?? 0) as number;
    },
    staleTime: 60_000,
  });
  const reviewQueueCount = data ?? 0;
  const disputedCount = rows.filter((t: any) => !!t.dispute).length;

  return (
    <>
      {reviewQueueCount > 0 && (
        <Button
          variant="secondary"
          onClick={() => setFilter("status", "at_warehouse")}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2 font-medium transition-colors ${
            filters.status === "at_warehouse"
              ? "border-warning-600 bg-warning-500 text-inverted"
              : "border-warning-400 bg-warning-100 text-warning-900 hover:bg-warning-200"
          }`}
          title={t("admin.operations.trades.filterReviewQueue")}
        >
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>
            {t("admin.operations.trades.reviewQueueCount", {
              count: reviewQueueCount,
            })}
          </span>
        </Button>
      )}
      {disputedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-700 bg-danger-900/20 px-4 py-2">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-danger-600" />
          <span className="text-danger-600">
            {t("admin.operations.trades.disputedCount", {
              count: disputedCount,
            })}
          </span>
        </div>
      )}
    </>
  );
}
