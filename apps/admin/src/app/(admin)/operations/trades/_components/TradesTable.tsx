"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { tradeColumns } from "../_lib/columns";
import { type Trade, mapTrades } from "../_lib/trades";

export function TradesTable() {
  const t = useTranslations();
  const { rows, isLoading, sort, setSort } = useResourceList<any>();
  const trades = useMemo(() => mapTrades(rows, t), [rows, t]);
  const columns = tradeColumns(t);

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
