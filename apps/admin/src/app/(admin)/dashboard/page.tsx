'use client';

import { AdminPage } from '@/components/page/AdminPage';
import { PageLoading } from '@/components/PageLoading';
import { PageHeader } from '@/components/AdminList';
import { useDashboard } from './_lib/useDashboard';
import { DashboardStats } from './_components/DashboardStats';
import { QuickActions } from './_components/QuickActions';
import { PendingActionsPanel } from './_components/PendingActionsPanel';
import { DashboardCharts } from './_components/DashboardCharts';
import { CategoryChart } from './_components/CategoryChart';
import { RecentOrders } from './_components/RecentOrders';
import { RecentTrades } from './_components/RecentTrades';

export default function DashboardPage() {
  const { data, loading, stats } = useDashboard();

  return (
    <AdminPage>
      <PageHeader title="Dashboard" description="Hoş geldiniz! İşte bugünkü genel bakış." />

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
