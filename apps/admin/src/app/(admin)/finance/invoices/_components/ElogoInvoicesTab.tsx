"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { elogoColumns } from "../_lib/columns";
import {
  type Invoice,
  mapInvoices,
  typeFilterOptions,
  statusFilterOptions,
  documentTypeFilterOptions,
} from "../_lib/types";
import { useTranslations } from "next-intl";

export function ElogoInvoicesTab() {
  const t = useTranslations();
  return (
    <ResourceList<Invoice>
      resource="invoices"
      fetcher={(p) =>
        adminApi.getInvoices(p).then((res) => {
          const root = res.data ?? {};
          const raw = root.data ?? root.items ?? [];
          const total = root.meta?.total ?? root.total ?? raw.length;
          return { ...res, data: { data: mapInvoices(raw), meta: { total } } };
        })
      }
      getRowId={(i) => i.id}
      syncUrl
      initialFilters={{
        type: "all",
        status: "all",
        documentType: "all",
        startDate: "",
        endDate: "",
      }}
      errorMessage={t("admin.finance.invoices.loadError")}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search
          placeholder={t("admin.finance.invoices.searchPlaceholder")}
        />
        <ResourceList.FilterSelect
          name="type"
          options={typeFilterOptions(t)}
          className="sm:w-44"
        />
        <ResourceList.FilterSelect
          name="status"
          options={statusFilterOptions(t)}
          className="sm:w-40"
        />
        <ResourceList.FilterSelect
          name="documentType"
          options={documentTypeFilterOptions(t)}
          className="sm:w-36"
        />
        <ResourceList.DateRange />
      </ResourceList.Toolbar>
      <ResourceList.Total unit={t("admin.finance.invoices.documentUnit")} />
      <ResourceList.Table
        columns={elogoColumns(t)}
        emptyText={t("admin.finance.invoices.empty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
