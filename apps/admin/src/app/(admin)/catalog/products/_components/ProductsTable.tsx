"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { mapProducts } from "../_lib/types";
import { productColumns } from "../_lib/columns";

/** Maps the raw product rows from context and renders the shared DataTable. */
export function ProductsTable() {
  const t = useTranslations();
  const { rows, isLoading, filters, search, sort, setSort } =
    useResourceList<any>();
  const products = useMemo(() => mapProducts(rows, t), [rows, t]);
  const columns = useMemo(() => productColumns(t), [t]);

  const filtered = search || filters.brandId || filters.carModelId;

  return (
    <DataTable
      columns={columns}
      data={products}
      loading={isLoading}
      getRowId={(p) => p.id}
      sort={sort}
      onSort={setSort}
      emptyText={
        filtered
          ? t("admin.catalog.products.emptyFiltered")
          : t("admin.catalog.products.empty")
      }
    />
  );
}
