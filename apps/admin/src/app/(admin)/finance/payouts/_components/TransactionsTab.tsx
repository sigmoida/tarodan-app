/** @format */

"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { transactionColumns } from "../_lib/columns";
import {
  type PayoutTransaction,
  payoutStatusFilterOptions,
} from "../_lib/types";
import { useTranslations } from "next-intl";
import { useSession } from "@/context/SessionContext";
import { ReleasePayoutModal } from "./ReleasePayoutModal";

export function TransactionsTab() {
  const t = useTranslations();
  const { user } = useSession();
  const [releaseOrderId, setReleaseOrderId] = useState<string | null>(null);

  const columns = transactionColumns(
    user?.role === "super_admin" ? setReleaseOrderId : undefined,
    t,
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
      {releaseOrderId && (
        <ReleasePayoutModal
          orderId={releaseOrderId}
          onClose={() => setReleaseOrderId(null)}
        />
      )}
    </ResourceList>
  );
}
