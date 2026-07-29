"use client";

import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { useResourceList } from "@/components/list";

export function TradesSummary() {
  const t = useTranslations();
  const { total, filters, setFilter } = useResourceList<any>();
  const userIdFilter = filters.userId ?? "";

  return (
    <>
      {t("admin.operations.trades.totalCount", { count: total })}
      {userIdFilter && (
        <span className="ml-2">
          — {t("admin.operations.common.filteringByUser")}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilter("userId", "")}
            className="ml-2 text-primary-600 hover:underline"
          >
            {t("admin.operations.common.removeFilter")}
          </Button>
        </span>
      )}
    </>
  );
}
