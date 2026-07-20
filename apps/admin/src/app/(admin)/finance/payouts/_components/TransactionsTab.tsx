/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { transactionColumns } from "../_lib/columns";
import {
  type PayoutTransaction,
  payoutStatusFilterOptions,
} from "../_lib/types";
import { useTranslations } from "next-intl";

export function TransactionsTab() {
  const t = useTranslations();
  const release = useAdminMutation(
    (orderId: string) => adminApi.releasePayout(orderId),
    {
      invalidates: ["payouts-transactions", "payouts-summary"],
      successMessage: t("admin.finance.payouts.releasedToSeller"),
    },
  );

  const columns = transactionColumns(
    (orderId) => release.mutate(orderId),
    t,
    release.isPending ? release.variables : undefined,
  );

  return (
    <ResourceList<PayoutTransaction>
      resource="payouts-transactions"
      fetcher={(p) =>
        adminApi.getPayoutsTransactions({
          search: p.search,
          page: p.page,
          limit: p.limit,
          status: p.status,
          dateFrom: p.dateFrom,
          dateTo: p.dateTo,
          sortBy: p.sortBy,
          sortOrder: p.sortOrder,
        })
      }
      getRowId={(t) => t.id}
      syncUrl
      initialFilters={{ status: "all", dateFrom: "", dateTo: "" }}
      errorMessage={t("admin.finance.payouts.historyLoadError")}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={payoutStatusFilterOptions(t)}
          className="sm:w-44"
        />
        <ResourceList.DateRange fromName="dateFrom" toName="dateTo" />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={columns}
        emptyText={t("admin.finance.payouts.empty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
