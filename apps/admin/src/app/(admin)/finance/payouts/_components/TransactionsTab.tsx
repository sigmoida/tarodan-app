/** @format */

"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { transactionColumns } from "../_lib/columns";
import { type PayoutTransaction } from "../_lib/types";
import { payoutTransactionFilterFields } from "../_lib/filters";
import { useTranslations } from "next-intl";
import { useSession } from "@/context/SessionContext";
import { ReleasePayoutModal } from "./ReleasePayoutModal";

export function TransactionsTab() {
  const t = useTranslations();
  const { user } = useSession();
  const [releaseTarget, setReleaseTarget] = useState<{
    orderId: string;
    early: boolean;
  } | null>(null);

  const columns = transactionColumns(
    user?.role === "super_admin"
      ? (orderId, early) => setReleaseTarget({ orderId, early })
      : undefined,
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
      filters={payoutTransactionFilterFields(t)}
    >
      <ResourceList.Toolbar />
      <ResourceList.Table
        columns={columns}
        emptyText={t("admin.finance.payouts.empty")}
      />
      <ResourceList.Pagination />
      {releaseTarget && (
        <ReleasePayoutModal
          orderId={releaseTarget.orderId}
          early={releaseTarget.early}
          onClose={() => setReleaseTarget(null)}
        />
      )}
    </ResourceList>
  );
}
