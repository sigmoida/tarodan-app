/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { sellerColumns } from "../_lib/columns";
import { type SellerInvoice, mapSellerInvoices } from "../_lib/types";
import { sellerInvoiceFilterFields } from "../_lib/filters";
import { useTranslations } from "next-intl";

export function SellerInvoicesTab() {
  const t = useTranslations();
  return (
    <ResourceList<SellerInvoice>
      resource="seller-invoices"
      fetcher={(p) =>
        adminApi.getSellerInvoices(p).then((res) => {
          const root = res.data ?? {};
          const raw = root.data ?? root.items ?? [];
          const total = root.meta?.total ?? root.total ?? raw.length;
          return {
            ...res,
            data: { data: mapSellerInvoices(raw), meta: { total } },
          };
        })
      }
      getRowId={(s) => s.id}
      syncUrl
      filters={sellerInvoiceFilterFields(t)}
    >
      <ResourceList.Toolbar />
      <ResourceList.Table
        columns={sellerColumns(t)}
        emptyText={t("admin.finance.invoices.empty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
