"use client";

import dynamic from "next/dynamic";
import { AdminPage } from "@/components/page/AdminPage";
import { PageLoading } from "@/components/PageLoading";
import { PageHeader } from "@/components/AdminList";
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

export default function DashboardPage() {
  const { data, loading, stats } = useDashboard();

  return (
    <AdminPage>
      <PageHeader
        title="Dashboard"
        description="Hoş geldiniz! İşte bugünkü genel bakış."
      />

      {loading || !data ? (
        <PageLoading />
      ) : (
        <>
          <DashboardStats stats={stats} />
          <QuickActions />
          <PendingActionsPanel pending={data.pendingActions} />
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
      )}
    </AdminPage>
  );
}
