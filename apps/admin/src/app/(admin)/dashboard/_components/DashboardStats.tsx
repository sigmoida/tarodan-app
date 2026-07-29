import {
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  UsersIcon,
  BanknotesIcon,
  ReceiptRefundIcon,
  SignalIcon,
  ArrowTrendingUpIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { MetricCard } from "@/components/MetricCard";
import { fmtNumber, fmtTry } from "@/lib/format";
import { PeriodBreakdown } from "./PeriodBreakdown";
import { type DashboardStats as Stats, type VisitorStats } from "../_lib/types";

const fmtCount = (n: number) => fmtNumber(n) ?? "—";
const fmtCurrency = (n: number) => fmtTry(n) ?? "—";

function SplitValue({ left, right }: { left: number; right: number }) {
  return (
    <span className="tabular-nums">
      {fmtCount(left)}
      <span className="mx-1 text-muted">/</span>
      {fmtCount(right)}
    </span>
  );
}

/**
 * The dashboard's two-row / eight-card metric grid (#301). Each card exposes
 * the period breakdown (yesterday / this month / last month) via the shared
 * `MetricCard` footer slot. Row 2 covers gross vs. net revenue plus the live
 * visitor count and cancellations/refunds, replacing the earlier revenue vs.
 * commission conflation.
 */
export function DashboardStats({
  stats,
  visitors,
}: {
  stats: Stats;
  visitors: VisitorStats;
}) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      {/* ── Row 1 ─────────────────────────────────────────────────────────── */}
      <MetricCard
        icon={ShoppingBagIcon}
        tone="info"
        label={t("admin.dashboard.stats.totalOrders")}
        value={fmtCount(stats.totalOrders)}
        change={stats.totalOrdersPeriods.changePercent}
        footer={<PeriodBreakdown periods={stats.totalOrdersPeriods} />}
      />
      <MetricCard
        icon={CurrencyDollarIcon}
        tone="success"
        label={t("admin.dashboard.stats.commissionRevenue")}
        value={fmtCurrency(stats.netCommissionTotal)}
        change={stats.netCommissionPeriods.changePercent}
        footer={
          <PeriodBreakdown
            periods={stats.netCommissionPeriods}
            format={fmtCurrency}
          />
        }
      />
      <MetricCard
        icon={ChartBarIcon}
        tone="primary"
        label={t("admin.dashboard.stats.products")}
        value={
          <SplitValue
            left={stats.activeProducts}
            right={stats.passiveProducts}
          />
        }
        title={`${t("admin.dashboard.stats.active")} / ${t("admin.dashboard.stats.passive")}`}
        change={stats.activeProductsPeriods.changePercent}
        footer={<PeriodBreakdown periods={stats.activeProductsPeriods} />}
      />
      <MetricCard
        icon={UsersIcon}
        tone="primary"
        label={t("admin.dashboard.stats.users")}
        value={
          <SplitValue left={stats.activeUsers} right={stats.passiveUsers} />
        }
        title={`${t("admin.dashboard.stats.active")} / ${t("admin.dashboard.stats.passive")}`}
        change={stats.activeUsersPeriods.changePercent}
        footer={<PeriodBreakdown periods={stats.activeUsersPeriods} />}
      />

      {/* ── Row 2 ─────────────────────────────────────────────────────────── */}
      <MetricCard
        icon={BanknotesIcon}
        tone="success"
        label={t("admin.dashboard.stats.grossSales")}
        value={fmtCurrency(stats.grossSales)}
        change={stats.grossSalesPeriods.changePercent}
        footer={
          <PeriodBreakdown
            periods={stats.grossSalesPeriods}
            format={fmtCurrency}
          />
        }
      />
      <MetricCard
        icon={ArrowTrendingUpIcon}
        tone="success"
        label={t("admin.dashboard.stats.netCommission")}
        value={fmtCurrency(stats.netCommissionRow2.thisMonth)}
        change={stats.netCommissionRow2.changePercent}
        footer={
          <PeriodBreakdown
            periods={stats.netCommissionRow2}
            format={fmtCurrency}
          />
        }
      />
      <MetricCard
        icon={SignalIcon}
        tone="info"
        label={t("admin.dashboard.stats.liveVisitors")}
        value={
          <span className="tabular-nums">
            {fmtCount(visitors.liveVisitors)}
            <span className="mx-1 text-muted">/</span>
            {fmtCount(visitors.dailyActiveVisitors)}
          </span>
        }
        title={`${t("admin.dashboard.stats.live")} / ${t("admin.dashboard.stats.daily")}`}
      />
      <MetricCard
        icon={ReceiptRefundIcon}
        tone="warning"
        label={t("admin.dashboard.stats.cancellationsRefunds")}
        value={<SplitValue left={stats.cancellations} right={stats.refunds} />}
        title={`${t("admin.dashboard.stats.cancellations")} / ${t("admin.dashboard.stats.refunds")}`}
        change={stats.cancellationsPeriods.changePercent}
        footer={<PeriodBreakdown periods={stats.cancellationsPeriods} />}
      />
    </div>
  );
}
