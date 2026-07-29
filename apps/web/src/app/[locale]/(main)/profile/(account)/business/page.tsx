"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Spinner, Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { useBusinessStats } from "./_hooks/useBusinessStats";
import { BUSINESS_TABS, type BusinessTab } from "./_lib/types";
import BusinessHeader from "./_sections/BusinessHeader";
import BusinessError from "./_sections/BusinessError";
import OverviewTab from "./_sections/OverviewTab";
import ProductsTab from "./_sections/ProductsTab";
import CollectionsTab from "./_sections/CollectionsTab";
import CorporateApplicationCompletion from "./_sections/CorporateApplicationCompletion";
import { corporateApplicationApi, type CorporateApplication } from "@/lib/api";

export default function BusinessDashboardPage() {
  const { ready } = useRequireAuth();
  const [tab, setTab] = useState<BusinessTab>("overview");
  const applicationQuery = useQuery({
    queryKey: ["corporate-application"],
    queryFn: async () => {
      try {
        return (await corporateApplicationApi.getMine())
          .data as CorporateApplication;
      } catch (error: any) {
        if ([400, 404].includes(error.response?.status)) return null;
        throw error;
      }
    },
    enabled: ready,
    retry: false,
  });

  const { stats, isLoading, error } = useBusinessStats(
    ready &&
      !applicationQuery.isLoading &&
      (!applicationQuery.data || applicationQuery.data.status === "approved"),
  );

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="xl" color="border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (applicationQuery.data && applicationQuery.data.status !== "approved") {
    return (
      <PageShell className="pb-16">
        <CorporateApplicationCompletion application={applicationQuery.data} />
      </PageShell>
    );
  }

  return (
    <PageShell className="pb-16">
      <PageHeader
        title="İşletme Paneli"
        description="Mağazanızın performans istatistikleri"
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="xl" color="border-primary-500 border-t-transparent" />
        </div>
      ) : error ? (
        <BusinessError error={error} />
      ) : stats ? (
        <>
          <BusinessHeader company={stats.company} />

          <Tabs value={tab} onValueChange={(v) => setTab(v as BusinessTab)}>
            <TabsList>
              {BUSINESS_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value}>
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {tab === "overview" && <OverviewTab stats={stats} />}
          {tab === "products" && (
            <ProductsTab topProducts={stats.topProducts} />
          )}
          {tab === "collections" && (
            <CollectionsTab collections={stats.topCollections} />
          )}
        </>
      ) : null}
    </PageShell>
  );
}
