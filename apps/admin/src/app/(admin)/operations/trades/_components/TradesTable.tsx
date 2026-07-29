"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { tradeColumns } from "../_lib/columns";
import { tradeRowMenu } from "../_lib/rowActions";
import { type Trade, mapTrades } from "../_lib/trades";

export function TradesTable() {
  const t = useTranslations();
  const router = useRouter();
  const { rows, isLoading, sort, setSort } = useResourceList<any>();
  const trades = useMemo(() => mapTrades(rows, t), [rows, t]);

  const columns = tradeColumns(
    t,
    tradeRowMenu(t, (trade) => router.push(`/operations/trades/${trade.id}`)),
  );

  return (
    <DataTable
      columns={columns}
      data={trades}
      loading={isLoading}
      emptyText={t("admin.operations.trades.empty")}
      getRowId={(tr) => tr.id}
      rowClassName={(tr) => (tr.hasDispute ? "bg-danger-900/10" : "")}
      sort={sort}
      onSort={setSort}
    />
  );
}
