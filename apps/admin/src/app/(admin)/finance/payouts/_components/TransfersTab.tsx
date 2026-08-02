/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { transferColumns } from "../_lib/columns";
import {
  type PayoutTransferRow,
  transferStatusFilterOptions,
} from "../_lib/types";
import { useTranslations } from "next-intl";

/**
 * Gerçek banka transferleri (PayoutTransfer). Escrow hold listesinden AYRI:
 * burada paranın satıcının hesabına gerçekten geçip geçmediği görünür;
 * başarısız/iade dönen transferler mevcut retry ucuna bağlı düğmeyle
 * yeniden kuyruğa alınır (uç vardı, UI'ı yoktu).
 */
export function TransfersTab() {
  const t = useTranslations();

  const retry = useAdminMutation(
    (transferId: string) => adminApi.retryPayoutTransfer(transferId),
    {
      invalidates: ["payouts-transfers", "payouts-summary"],
      successMessage: t("admin.finance.payouts.transferRetried"),
    },
  );

  return (
    <ResourceList<PayoutTransferRow>
      resource="payouts-transfers"
      fetcher={(p) =>
        adminApi
          .getPayoutTransfers({
            status: p.status,
            search: p.search,
            dateFrom: p.dateFrom,
            dateTo: p.dateTo,
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
      initialFilters={{ status: "all", dateFrom: "", dateTo: "" }}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={transferStatusFilterOptions(t)}
          className="sm:w-44"
        />
        <ResourceList.DateRange fromName="dateFrom" toName="dateTo" />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={transferColumns(
          (r) => retry.mutate(r.id),
          retry.isPending ? (retry.variables as string) : undefined,
          t,
        )}
        emptyText={t("admin.finance.payouts.empty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
