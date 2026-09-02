/** @format */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { ResourceList } from "@/components/list";
import { useListTotals } from "@/hooks/useListTotal";
import { useTabParam } from "@/hooks/useTabParam";
import {
  type Product,
  type ProductStatusTab,
  AI_TAB,
  PRODUCT_STATUS_TABS,
  getProductTabs,
  isProductStatusTab,
} from "./_lib/types";
import { ProductsCountText } from "./_components/ProductsCountText";
import { productFilterFields } from "./_lib/filters";
import { useBrandOptions, useCarModelOptions } from "@/hooks/useBrandOptions";
import { ProductsTable } from "./_components/ProductsTable";
import { ProductBulkImportModal } from "./_components/ProductBulkImportModal";

const DEFAULT_TAB: ProductStatusTab = "active";

/** Sekme sayaçlarının parametreleri: durum başına `{ status }`. */
const TAB_COUNT_PARAMS = Object.fromEntries(
  PRODUCT_STATUS_TABS.map((status) => [status, { status }]),
) as Record<ProductStatusTab, { status: ProductStatusTab }>;

/**
 * Ürünler: durum (aktif / onay bekliyor / …) sekmedir, kolon ya da filtre
 * değil. Sekme `status`'un tek sahibidir: fetcher'da her isteğe eklenir,
 * URL'den okunmaz/yazılmaz (`?tab=pending` tek deep-link biçimi). AI Denetim
 * son sekmede kalır.
 */
export default function ProductsPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam(DEFAULT_TAB);
  const status: ProductStatusTab = isProductStatusTab(tab) ? tab : DEFAULT_TAB;
  const counts = useListTotals(
    "products",
    TAB_COUNT_PARAMS,
    adminApi.getProducts,
  );
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const brands = useBrandOptions();
  const models = useCarModelOptions();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.catalog.products.title")}
        description={<ProductsCountText />}
      >
        <Button
          variant="primary"
          leftIcon={<ArrowUpTrayIcon className="h-5 w-5" />}
          onClick={() => setBulkImportOpen(true)}
        >
          {t("admin.catalog.products.bulkImport")}
        </Button>
      </PageHeader>
      <AdminTabs
        tabs={getProductTabs(t, counts)}
        value={tab}
        onChange={setTab}
      />

      {tab === AI_TAB ? (
        <ModerationEventsPanel entityType="product" chrome={false} />
      ) : (
        <ResourceList<Product>
          key={status}
          resource="products"
          // status sekmenin sabit parametresi: URL filtresi değil, her isteğe eklenir.
          fetcher={(params) => adminApi.getProducts({ ...params, status })}
          getRowId={(p) => p.id}
          syncUrl
          filters={productFilterFields(t, brands, models)}
          // `sellerId`: satıcı detayından gelen deep-link (kendi kontrolü yok).
          initialFilters={{ sellerId: "" }}
        >
          <ResourceList.Toolbar
            searchPlaceholder={t("admin.catalog.products.searchPlaceholder")}
          />
          <ProductsTable />
          <ResourceList.Pagination />
        </ResourceList>
      )}

      {bulkImportOpen && (
        <ProductBulkImportModal open onClose={() => setBulkImportOpen(false)} />
      )}
    </AdminPage>
  );
}
