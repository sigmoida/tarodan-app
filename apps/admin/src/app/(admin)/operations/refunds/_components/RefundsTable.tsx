"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { AdminRefundRow, AdminRefundTab } from "@tarodan/types";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { refundColumns } from "../_lib/columns";
import { refundRowClassName } from "../_lib/rowView";

/**
 * İadeler tablosu: satır = iade talebi (API satırı hazır döner). Kolonlar
 * sekmeye göre değişir (Depo yalnız Takas'ta); takas iadelerinin iki satırı
 * sol çizgiyle gruplanır.
 */
export function RefundsTable({ tab }: { tab: AdminRefundTab }) {
  const t = useTranslations();
  const { rows, isLoading, search, filters, sort, setSort } =
    useResourceList<AdminRefundRow>();
  const columns = useMemo(() => refundColumns(t, tab), [t, tab]);

  const filtered =
    !!search ||
    Object.values(filters).some((value) => value && value !== "all");

  return (
    <DataTable
      columns={columns}
      data={rows}
      loading={isLoading}
      emptyText={
        filtered
          ? t("admin.operations.refunds.emptyFiltered")
          : t("admin.operations.refunds.empty")
      }
      getRowId={(row) => row.id}
      rowClassName={refundRowClassName}
      sort={sort}
      onSort={setSort}
    />
  );
}
