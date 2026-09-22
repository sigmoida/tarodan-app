"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { DeepLinkFilterSummary } from "@/components/list/DeepLinkFilterSummary";
import type { OfferRow } from "@/app/(admin)/operations/offers/_lib/offers";
import { offerFilterFields } from "../../_lib/offers/filters";
import { OrdersScreenTabBar } from "../OrdersScreenTabBar";
import { OffersTable } from "./OffersTable";

/**
 * Teklifler sekmesi: siparişe dönmüş ya da dönmemiş BÜTÜN teklifler (eski
 * `/operations/offers` listesi — aynı kolonlar, durum filtresi ve işlemler).
 * "Bekleyen" / "Süresi Dolan" durum filtresidir. Ürün/kullanıcı detayından
 * `productId` / `userId` deep-link alır; izin `orders`.
 */
export function OffersView() {
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
      <OrdersScreenTabBar />
      <ResourceList.Toolbar />
      <p className="text-sm text-muted empty:hidden">
        <DeepLinkFilterSummary
          totalLabel={(count) =>
            t("admin.operations.offers.totalCount", { count })
          }
        />
      </p>
      <OffersTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
