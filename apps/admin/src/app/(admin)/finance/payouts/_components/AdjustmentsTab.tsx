/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { adjustmentColumns } from "../_lib/columns";
import {
  type PayoutAdjustmentRow,
  adjustmentStatusFilterOptions,
} from "../_lib/types";
import { useTranslations } from "next-intl";

/**
 * Satıcı borç mahsupları (SellerAccountAdjustment): dönüş kargosu borcu, gidiş
 * kargosu borcu, kargo açığı. Payout'tan kesilecek/kesilen tutarların yüzeyi —
 * eskiden bu para admin için görünmezdi.
 */
export function AdjustmentsTab() {
  const t = useTranslations();

  return (
    <ResourceList<PayoutAdjustmentRow>
      resource="payouts-adjustments"
      fetcher={(p) =>
        adminApi
          .getPayoutAdjustments({
            status: p.status,
            search: p.search,
            page: p.page,
            limit: p.limit,
          })
          .then((res) => ({
            ...res,
            data: {
              data: res.data?.items ?? [],
              meta: { total: res.data?.total ?? 0 },
            },
          }))
      }
      getRowId={(r) => r.id}
      syncUrl
      initialFilters={{ status: "all" }}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={adjustmentStatusFilterOptions(t)}
          className="sm:w-40"
        />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={adjustmentColumns(t)}
        emptyText={t("admin.finance.payouts.empty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
