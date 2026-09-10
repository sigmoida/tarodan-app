/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { sellerColumns } from "../_lib/columns";
import { type SellerInvoice, mapSellerInvoices } from "../_lib/types";
import { sellerInvoiceFilterFields } from "../_lib/filters";
import { useTranslations } from "next-intl";

/**
 * "Kurumsal Cari Faturaları" — kurumsal satıcıların siparişe ELLE yüklediği ürün
 * faturaları. Tarodan'ın kestiği belgelerle aynı tabloda gösterilemez: bunlar
 * bizim değil satıcının belgeleridir, ne fatura numaraları bizim sayacımızdan
 * gelir ne de bir e-belge durumları vardır.
 */
export function CorporateInvoicesTab() {
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
      <ResourceList.Total unit={t("admin.finance.invoices.invoiceUnit")} />
      <ResourceList.Table
        columns={sellerColumns(t)}
        emptyText={t("admin.finance.invoices.empty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
