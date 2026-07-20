"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { mapProducts } from "../_lib/types";
import { productColumns, type ProductRowActions } from "../_lib/columns";

/** Maps the raw product rows from context and renders the shared DataTable. */
export function ProductsTable(actions: Omit<ProductRowActions, "onView">) {
  const t = useTranslations();
  const router = useRouter();
  const { rows, isLoading, filters, search, sort, setSort } =
    useResourceList<any>();
  const products = useMemo(() => mapProducts(rows, t), [rows, t]);
  const columns = useMemo(
    () =>
      productColumns(t, {
        ...actions,
        onView: (p) => router.push(`/catalog/products/${p.id}`),
      }),
    [t, actions, router],
  );

  const filtered =
    search || filters.status !== "all" || filters.brandId || filters.carModelId;

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
