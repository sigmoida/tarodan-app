/** @format */

"use client";

import { useTranslations } from "next-intl";
import { isAdminOrderListTab } from "@tarodan/types";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { useOrdersScreenTab } from "./_hooks/useOrdersScreenTab";
import { OrdersView } from "./_components/OrdersView";
import { OffersView } from "./_components/offers/OffersView";
import { TradesView } from "./_components/trades/TradesView";

/**
 * Siparişler: beş üst sekme — Tüm Siparişler / Direkt Satış / Teklifler /
 * Siparişe Dönen Teklifler / Takaslar. Sipariş sekmeleri tek sipariş
 * listesini (kovalarıyla), Teklifler bütün teklifleri, Takaslar takasları
 * listeler; her sekmenin tablosu kendi yapısındadır. Sekme URL'de yaşar,
 * yalnız etkin sekmenin listesi bağlanır. Eski `/operations/offers` ve
 * `/operations/trades` listeleri buraya yönlenir.
 */
export default function OrdersPage() {
  const t = useTranslations();
  const { tab } = useOrdersScreenTab();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.operations.orders.title")}
        description={t("admin.operations.orders.pageDescription")}
      />
      {isAdminOrderListTab(tab) ? (
        <OrdersView tab={tab} />
      ) : tab === "offers" ? (
        <OffersView />
      ) : (
        <TradesView />
      )}
    </AdminPage>
  );
}
