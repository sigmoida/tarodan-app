"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { mapProducts } from "../_lib/types";
import { productColumns } from "../_lib/columns";
import { productFilterKeys } from "../_lib/filters";
import { canRenewExpiredListing } from "../[id]/_lib/renewal";

/** Maps the raw product rows from context and renders the shared DataTable. */
export function ProductsTable() {
  const t = useTranslations();
  const { rows, isLoading, filters, search, sort, setSort, selection } =
    useResourceList<any>();
  const products = useMemo(() => mapProducts(rows, t), [rows, t]);
  const columns = useMemo(() => productColumns(t), [t]);

  // Listenin filtre kümesi tek yerden (başlıktaki toplamla aynı).
  const filtered =
    !!search || productFilterKeys(t).some((key) => !!filters[key]);

  return (
    <DataTable
      columns={columns}
      data={products}
      loading={isLoading}
      getRowId={(p) => p.id}
      selectable={selection.selectable}
      selectedIds={selection.selectedIds}
      onToggleRow={selection.toggleRow}
      onToggleAll={selection.toggleAll}
      // Seçim yalnız toplu yenilemeye yarar: süresi dolmuş olmayan satır seçilemez.
      isRowSelectable={(p) => canRenewExpiredListing(p)}
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
