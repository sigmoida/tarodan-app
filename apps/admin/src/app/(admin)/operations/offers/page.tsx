"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { DeepLinkFilterSummary } from "@/components/list/DeepLinkFilterSummary";
import { offerFilterFields } from "./_lib/filters";
import type { OfferRow } from "./_lib/offers";
import { OffersTable } from "./_components/OffersTable";

/**
 * Teklifler (pazarlık kayıtları) — siparişlerden ayrı route; izin `orders`
 * (nav item'ın permission alanı). Ürün/kullanıcı detayından `productId`/`userId`
 * deep-link alır.
 */
export default function OffersPage() {
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
        title={t("admin.operations.offers.title")}
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
