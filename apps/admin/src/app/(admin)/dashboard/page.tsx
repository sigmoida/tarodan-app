"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { SuspenseBoundary } from "@/components/page/SuspenseBoundary";
import { useDashboard } from "./_lib/useDashboard";
import { DashboardStats } from "./_components/DashboardStats";
import { QuickActions } from "./_components/QuickActions";
import { PendingActionsPanel } from "./_components/PendingActionsPanel";
// Charts pull in chart.js/react-chartjs-2 (~150KB) and render below the stat
// cards, so they load lazily off the /dashboard landing bundle (#102).
const DashboardCharts = dynamic(
  () => import("./_components/DashboardCharts").then((m) => m.DashboardCharts),
  { ssr: false },
);
const CategoryChart = dynamic(
  () => import("./_components/CategoryChart").then((m) => m.CategoryChart),
  { ssr: false },
);
import { RecentOrders } from "./_components/RecentOrders";
import { RecentTrades } from "./_components/RecentTrades";
import { TopProductsWidget } from "./_components/TopProductsWidget";
import { TopSellersWidget } from "./_components/TopSellersWidget";

function DashboardContent() {
  const data = useDashboard();

  return (
    <>
      <DashboardStats stats={data.stats} visitors={data.visitors} />
      <QuickActions />
      <PendingActionsPanel pending={data.pendingActions} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopProductsWidget products={data.topProducts} />
        <TopSellersWidget sellers={data.topSellers} />
      </div>
      <DashboardCharts
        salesByDay={data.analytics.salesByDay}
        ordersByDay={data.analytics.ordersByDay}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <CategoryChart categories={data.analytics.categoryDistribution} />
        <RecentOrders orders={data.recentOrders} />
      </div>
      <RecentTrades trades={data.recentTrades} />
    </>
  );
}

export default function DashboardPage() {
  const t = useTranslations();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.dashboard.title")}
        description={t("admin.dashboard.description")}
      />
      <SuspenseBoundary>
        <DashboardContent />
      </SuspenseBoundary>
    </AdminPage>
  );
}
