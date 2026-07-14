"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Select } from "@tarodan/ui";
import { AdminPage } from "@/components/page/AdminPage";
import { PageLoading } from "@/components/PageLoading";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import {
  type DateRange,
  DATE_RANGE_OPTIONS,
  ANALYTICS_TABS,
} from "./_lib/types";
import { useAnalytics } from "./_lib/useAnalytics";
import { AnalyticsExport } from "./_components/AnalyticsExport";
// Each chart tab pulls in chart.js; only the active tab renders, so load them
// lazily per-tab instead of shipping all charts in the analytics bundle (#102).
const SalesTab = dynamic(
  () => import("./_components/SalesTab").then((m) => m.SalesTab),
  { ssr: false },
);
const UsersTab = dynamic(
  () => import("./_components/UsersTab").then((m) => m.UsersTab),
  { ssr: false },
);
const ProductsTab = dynamic(
  () => import("./_components/ProductsTab").then((m) => m.ProductsTab),
  { ssr: false },
);
import { TradesTab } from "./_components/TradesTab";

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [tab, setTab] = useState("sales");
  const { data, loading } = useAnalytics(dateRange);

  return (
    <AdminPage>
      <PageHeader
        title="Analizler"
        description="Detaylı satış, kullanıcı ve ürün analizleri"
      >
        <AnalyticsExport dateRange={dateRange} activeTab={tab} />
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AdminTabs tabs={ANALYTICS_TABS} value={tab} onChange={setTab} />
        <Select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRange)}
          options={DATE_RANGE_OPTIONS}
          className="sm:w-40"
        />
      </div>

      {loading || !data ? (
        <PageLoading />
      ) : (
        <>
          {tab === "sales" && <SalesTab report={data.salesReport} />}
          {tab === "users" && <UsersTab report={data.userReport} />}
          {tab === "products" && <ProductsTab report={data.productReport} />}
          {tab === "trades" && <TradesTab report={data.tradeReport} />}
        </>
      )}
    </AdminPage>
  );
}
