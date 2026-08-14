"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { elogoColumns } from "../_lib/columns";
import { type Invoice, mapInvoices } from "../_lib/types";
import { elogoInvoiceFilterFields } from "../_lib/filters";
import { useTranslations } from "next-intl";

export function ElogoInvoicesTab() {
  const t = useTranslations();
  const retry = useAdminMutation(
    (id: string) => adminApi.retryElogoInvoice(id),
    {
      invalidates: ["invoices", "invoices-summary"],
      successMessage: t("admin.finance.invoices.retried"),
    },
  );
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
      filters={elogoInvoiceFilterFields(t)}
    >
      <ResourceList.Toolbar
        searchPlaceholder={t("admin.finance.invoices.searchPlaceholder")}
      />
      <ResourceList.Table
        columns={elogoColumns(
          t,
          (i) => retry.mutate(i.id),
          retry.isPending ? (retry.variables as string) : undefined,
        )}
        emptyText={t("admin.finance.invoices.empty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
