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
import { useTabParam } from "@/hooks/useTabParam";
import { type Product, getProductTabs } from "./_lib/types";
import { ProductsCountText } from "./_components/ProductsCountText";
import { productFilterFields } from "./_lib/filters";
import { useBrandOptions, useCarModelOptions } from "@/hooks/useBrandOptions";
import { ProductsTable } from "./_components/ProductsTable";
import { ProductBulkImportModal } from "./_components/ProductBulkImportModal";

export default function ProductsPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("list");
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
      <AdminTabs tabs={getProductTabs(t)} value={tab} onChange={setTab} />

      {tab === "ai" ? (
        <ModerationEventsPanel entityType="product" chrome={false} />
      ) : (
        <ResourceList<Product>
          resource="products"
          fetcher={(params) => adminApi.getProducts(params)}
          getRowId={(p) => p.id}
          syncUrl
          filters={productFilterFields(t, brands, models)}
          // `sellerId` has no control — it arrives as a deep link from a seller.
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
