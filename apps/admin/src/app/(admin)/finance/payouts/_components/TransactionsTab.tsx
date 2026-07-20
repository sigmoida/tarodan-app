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

export function TransactionsTab() {
  const release = useAdminMutation(
    (orderId: string) => adminApi.releasePayout(orderId),
    {
      invalidates: ["payouts-transactions", "payouts-summary"],
      successMessage: "Ödeme satıcıya serbest bırakıldı",
    },
  );

  const columns = transactionColumns((orderId) => release.mutate(orderId));

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
      errorMessage="İşlem geçmişi yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={payoutStatusFilterOptions}
          className="sm:w-44"
        />
        <ResourceList.DateRange fromName="dateFrom" toName="dateTo" />
      </ResourceList.Toolbar>
      <ResourceList.Table columns={columns} emptyText="Kayıt yok" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
