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
import { ProductFilters } from "./_components/ProductFilters";
import { ProductsTable } from "./_components/ProductsTable";
import { ProductBulkImportModal } from "./_components/ProductBulkImportModal";

export default function ProductsPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("list");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

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
          initialFilters={{
            status: "all",
            sellerId: "",
            brandId: "",
            carModelId: "",
            startDate: "",
            endDate: "",
          }}
        >
          <ResourceList.Toolbar>
            <ResourceList.Search
              placeholder={t("admin.catalog.products.searchPlaceholder")}
            />
            <ProductFilters />
            <ResourceList.DateRange />
          </ResourceList.Toolbar>
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
