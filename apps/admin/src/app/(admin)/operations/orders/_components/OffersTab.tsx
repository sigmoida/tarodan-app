"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { offerFilterFields } from "../_lib/filters";
import type { OfferRow } from "../_lib/offers";
import { DeepLinkFilterSummary } from "./DeepLinkFilterSummary";
import { OffersTable } from "./OffersTable";

/** "Teklifler" sekmesi — ürün/kullanıcı detayından `productId`/`userId` deep-link alır. */
export function OffersTab() {
  const t = useTranslations();
  return (
    <ResourceList<OfferRow>
      resource="offers"
      fetcher={(p) => adminApi.getOffers(p)}
      getRowId={(o) => o.id}
      syncUrl
      filters={offerFilterFields(t)}
      initialFilters={{ userId: "", userRole: "", productId: "" }}
    >
      <ResourceList.Header
        title={t("admin.operations.orders.tabs.offers")}
        description={
          <DeepLinkFilterSummary
            totalLabel={(count) =>
              t("admin.operations.offers.totalCount", { count })
            }
          />
        }
      />
      <ResourceList.Toolbar />
      <OffersTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
