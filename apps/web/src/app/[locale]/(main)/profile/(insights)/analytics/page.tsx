"use client";

import { useState } from "react";
import {
  EyeIcon,
  HeartIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  TagIcon,
  ClockIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Button, Spinner, Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import { MetricCard } from "@/components/ui";
import { useAuthStore } from "@/stores/authStore";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { formatTL } from "@/lib/format";
import { useAnalytics } from "./_hooks/useAnalytics";
import { PERIOD_TABS, type AnalyticsPeriod } from "./_lib/types";
import AnalyticsStatCard from "./_components/AnalyticsStatCard";
import SimpleBarChart from "./_components/SimpleBarChart";
import RecentActivityCard from "./_sections/RecentActivityCard";
import TopProductsCard from "./_sections/TopProductsCard";
import CategoryPerformanceCard from "./_sections/CategoryPerformanceCard";
import PremiumUpsell from "./_sections/PremiumUpsell";
import TipsSection from "./_sections/TipsSection";
import { useTranslations } from "next-intl";

export default function AnalyticsPage() {
  const t = useTranslations();
  const { ready } = useRequireAuth();
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");

  // Analytics is a premium/business-only feature. `membershipTier` is the EFFECTIVE
  // tier from the API (a past_due/expired paid tier reads as free), so this gate
  // matches the API's own 403 — the data query is skipped entirely for free users.
  const isPremium =
    user?.membershipTier === "premium" || user?.membershipTier === "business";

  const { analytics, isLoading } = useAnalytics(period, ready && isPremium);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="xl" color="border-primary-500 border-t-transparent" />
      </div>
    );
  }

  const trendDays = period === "7d" ? "7" : "14";

  return (
    <PageShell className="pb-16">
      <PageHeader
        title={t("profile.analytics.performansAnalizi")}
        description={t("profile.analytics.ilanlarinizinDetayliIstatistikleri")}
      />

      <Tabs
        value={period}
        onValueChange={(v) => setPeriod(v as AnalyticsPeriod)}
      >
        <TabsList>
          {PERIOD_TABS(t).map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!isPremium ? (
        <PremiumUpsell />
      ) : isLoading || !analytics ? (
        <div className="flex justify-center py-16">
          <Spinner size="xl" color="border-primary-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <AnalyticsStatCard
              title={t("profile.analytics.toplamGoruntuleme")}
              value={analytics.totalViews.toLocaleString("tr-TR")}
              change={analytics.viewsChange}
              icon={EyeIcon}
              accent="text-primary-600"
              chartData={analytics.dailyViews.map((d) => d.views)}
              chartColor="bg-primary-400"
              subtitle={t("profile.analytics.gunlukOrtAvgViewsPerListing", {
                avgViewsPerListing: analytics.avgViewsPerListing,
              })}
            />
            <AnalyticsStatCard
              title={t("profile.analytics.favoriyeEkleme")}
              value={analytics.totalFavorites.toLocaleString("tr-TR")}
              change={analytics.favoritesChange}
              icon={HeartIcon}
              accent="text-danger-600"
              chartData={analytics.dailyViews.map((d) => d.favorites)}
              chartColor="bg-danger-400"
            />
            <AnalyticsStatCard
              title={t("profile.analytics.toplamSatis")}
              value={analytics.totalSales}
              change={analytics.salesChange}
              icon={ShoppingCartIcon}
              accent="text-success-600"
              subtitle={t("profile.analytics.donusumOraniToFixed", {
                toFixed: analytics.conversionRate.toFixed(2),
              })}
            />
            <AnalyticsStatCard
              title={t("profile.analytics.toplamGelir")}
              value={formatTL(analytics.totalRevenue)}
              change={analytics.revenueChange}
              icon={CurrencyDollarIcon}
              accent="text-primary-600"
            />
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              icon={TagIcon}
              label={t("profile.analytics.aktifIlan")}
              value={analytics.activeListings}
              accent="text-primary-600"
            />
            <MetricCard
              icon={ClockIcon}
              label={t("profile.analytics.ortSatisSuresiGun")}
              value={analytics.avgTimeToSell}
              accent="text-warning-600"
            />
            <MetricCard
              icon={UserGroupIcon}
              label={t("profile.analytics.tekrarMusteri")}
              value={`%${analytics.repeatCustomerRate}`}
              accent="text-primary-600"
            />
            <MetricCard
              icon={ShoppingCartIcon}
              label={t("profile.analytics.bekleyenSiparis")}
              value={analytics.pendingOrders}
              accent="text-primary-600"
            />
          </div>

          {/* Chart + activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SectionCard title={t("profile.analytics.goruntulemeGrafigi")}>
                <p className="mb-4 text-sm text-muted">
                  {t("profile.analytics.trendDays", { days: trendDays })}
                </p>
                <SimpleBarChart data={analytics.dailyViews} />
              </SectionCard>
            </div>
            <RecentActivityCard activity={analytics.recentActivity} />
          </div>

          {/* Top products + categories */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TopProductsCard products={analytics.topProducts} />
            <CategoryPerformanceCard categories={analytics.categoryStats} />
          </div>

          <TipsSection />
        </>
      )}
    </PageShell>
  );
}
