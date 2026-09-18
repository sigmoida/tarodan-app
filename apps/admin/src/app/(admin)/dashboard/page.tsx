"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "@tarodan/ui";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { SuspenseBoundary } from "@/components/page/SuspenseBoundary";
import { useDashboard } from "./_lib/useDashboard";
import { useDashboardPeriod } from "./_lib/useDashboardPeriod";
import type { DashboardPeriodSelection } from "./_lib/periodParams";
import { DashboardStats } from "./_components/DashboardStats";
import { DashboardPeriodFilter } from "./_components/DashboardPeriodFilter";
import { PendingActionsPanel } from "./_components/PendingActionsPanel";
// Charts pull in chart.js/react-chartjs-2 (~150KB) and render below the stat
// cards, so they load lazily off the /dashboard landing bundle (#102).
const DashboardCharts = dynamic(
  () => import("./_components/DashboardCharts").then((m) => m.DashboardCharts),
  { ssr: false },
);
import { RecentOrders } from "./_components/RecentOrders";
import { RecentTrades } from "./_components/RecentTrades";
import { TopProductsWidget } from "./_components/TopProductsWidget";
import { TopSellersWidget } from "./_components/TopSellersWidget";

function DashboardContent({
  selection,
}: {
  selection: DashboardPeriodSelection;
}) {
  const data = useDashboard(selection);

  return (
    <>
      <DashboardStats metrics={data.metrics} />
      <PendingActionsPanel pending={data.pendingActions} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopProductsWidget products={data.topProducts} />
        <TopSellersWidget sellers={data.topSellers} />
      </div>
      <DashboardCharts
        salesByDay={data.analytics.salesByDay}
        ordersByDay={data.analytics.ordersByDay}
      />
      <RecentOrders orders={data.recentOrders} />
      <RecentTrades trades={data.recentTrades} />
    </>
  );
}

/**
 * Dashboard data is loaded through the browser-only same-origin gateway. Wait
 * until hydration completes before starting those requests, so SSR and the
 * browser's first render share the same loading snapshot.
 */
function HydratedDashboardContent({
  selection,
}: {
  selection: DashboardPeriodSelection;
}) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-16" aria-busy="true">
        <Spinner size="lg" />
      </div>
    );
  }

  return <DashboardContent selection={selection} />;
}

export default function DashboardPage() {
  const t = useTranslations();
  const [selection, setSelection] = useDashboardPeriod();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.dashboard.title")}
        description={t("admin.dashboard.description")}
      >
        <DashboardPeriodFilter selection={selection} onChange={setSelection} />
      </PageHeader>
      <SuspenseBoundary>
        <HydratedDashboardContent selection={selection} />
      </SuspenseBoundary>
    </AdminPage>
  );
}
