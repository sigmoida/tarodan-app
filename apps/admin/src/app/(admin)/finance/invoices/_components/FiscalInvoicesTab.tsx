"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { fiscalInvoiceColumns } from "../_lib/columns";
import {
  FISCAL_INVOICE_LIST_RESOURCES,
  type Invoice,
  invoiceListResource,
  mapInvoices,
} from "../_lib/types";
import { fiscalInvoiceFilterFields } from "../_lib/filters";
import { useTranslations } from "next-intl";

/**
 * Tarodan'ın kestiği belgelerin listesi. Beş sekme de bu bileşendir; aralarındaki
 * tek fark sunucuya giden `scope` — sekme başına ayrı bir liste yazmak, kolon ve
 * filtre şemasının beş kopyasını tutmak demek olurdu.
 *
 * `key={scope}` sayfa/filtre durumunu sekme değişince sıfırlar: 3. sayfadayken
 * başka sekmeye geçen operatör boş liste görüyordu.
 */
export function FiscalInvoicesTab({ scope }: { scope: string }) {
  const t = useTranslations();
  const retry = useAdminMutation(
    (id: string) => adminApi.retryFiscalInvoice(id),
    {
      // Sekmeler çakışır: yeniden denenen belge birden fazla listenin
      // önbelleğinde durur, hepsi birden tazelenmeli.
      invalidates: [...FISCAL_INVOICE_LIST_RESOURCES, "invoices-summary"],
      successMessage: t("admin.finance.invoices.retried"),
    },
  );
  return (
    <ResourceList<Invoice>
      key={scope}
      resource={invoiceListResource(scope)}
      fetcher={(p) =>
        adminApi.getInvoices({ ...p, scope }).then((res) => {
          const root = res.data ?? {};
          const raw = root.data ?? root.items ?? [];
          const total = root.meta?.total ?? root.total ?? raw.length;
          return { ...res, data: { data: mapInvoices(raw), meta: { total } } };
        })
      }
      getRowId={(i) => i.id}
      syncUrl
      filters={fiscalInvoiceFilterFields(t)}
    >
      <ResourceList.Toolbar
        searchPlaceholder={t("admin.finance.invoices.searchPlaceholder")}
      />
      <ResourceList.Total unit={t("admin.finance.invoices.invoiceUnit")} />
      <ResourceList.Table
        columns={fiscalInvoiceColumns(
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
