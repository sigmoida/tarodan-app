"use client";

import { useTranslations } from "next-intl";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { useDashboardPeriod } from "./_lib/useDashboardPeriod";
import {
  useDashboardLists,
  useDashboardStats,
  useDashboardStock,
  useDashboardTopLists,
  useDashboardWorklist,
} from "./_lib/useDashboard";
import type { DashboardPeriodSelection } from "./_lib/periodParams";
import { toDashboardMetrics } from "./_lib/metrics";
import { DashboardPeriodFilter } from "./_components/DashboardPeriodFilter";
import { DashboardRefreshButton } from "./_components/DashboardRefreshButton";
import { QueuesZone } from "./_components/QueuesZone";
import { AlertsZone } from "./_components/AlertsZone";
import { DashboardStats } from "./_components/DashboardStats";
import { StockZone } from "./_components/StockZone";
import { RecentOrders } from "./_components/RecentOrders";
import { RecentTrades } from "./_components/RecentTrades";
import { TopProductsWidget } from "./_components/TopProductsWidget";
import { TopSellersWidget } from "./_components/TopSellersWidget";

/** Every metric at zero — what the cards read from while the period loads. */
const EMPTY_METRICS = toDashboardMetrics(undefined);

/**
 * Zone C, with its own heading — the filter sits ON that heading's row
 * (right-aligned) rather than in the page header, so its reach is
 * unambiguous: it touches this section and nothing else on the page.
 */
function PeriodZone({
  selection,
  onSelectionChange,
}: {
  selection: DashboardPeriodSelection;
  onSelectionChange: (next: DashboardPeriodSelection) => void;
}) {
  const t = useTranslations();
  const stats = useDashboardStats(selection);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-heading">
          {t("admin.dashboard.zones.period")}
        </h2>
        <DashboardPeriodFilter
          selection={selection}
          onChange={onSelectionChange}
        />
      </div>
      <DashboardStats
        metrics={stats.data?.metrics ?? EMPTY_METRICS}
        isLoading={stats.isLoading}
      />
    </section>
  );
}

export default function DashboardPage() {
  const t = useTranslations();
  const [selection, setSelection] = useDashboardPeriod();

  const worklist = useDashboardWorklist();
  const stock = useDashboardStock();
  const lists = useDashboardLists();
  const top = useDashboardTopLists();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.dashboard.title")}
        description={t("admin.dashboard.description")}
      >
        <DashboardRefreshButton />
      </PageHeader>

      {/* Zone A + B — never date-filtered, and they paint first. */}
      <QueuesZone
        queues={worklist.data?.queues ?? []}
        isLoading={worklist.isLoading}
        isError={worklist.isError}
      />
      <AlertsZone alerts={worklist.data?.alerts ?? []} />

      <PeriodZone selection={selection} onSelectionChange={setSelection} />

      <StockZone stock={stock.data} isLoading={stock.isLoading} />

      <RecentOrders orders={lists.data?.recentOrders ?? []} />
      <RecentTrades trades={lists.data?.recentTrades ?? []} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopProductsWidget products={top.data?.topProducts ?? []} />
        <TopSellersWidget sellers={top.data?.topSellers ?? []} />
      </div>
    </AdminPage>
  );
}
