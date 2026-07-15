"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowsRightLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";
import { Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useTrades } from "./_hooks/useTrades";
import TradeCard from "./_components/TradeCard";

export default function TradesPage() {
  const router = useRouter();
  const t = useTranslations();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) router.push("/login?redirect=/profile/trades");
  }, [isAuthenticated, authLoading, router]);

  const { trades, isLoading } = useTrades(
    statusFilter,
    !authLoading && isAuthenticated,
  );

  const filters = [
    { value: "all", label: t("common.all"), Icon: null },
    { value: "pending", label: t("trade.statusPending"), Icon: ClockIcon },
    {
      value: "shipped",
      label: t("trade.filterInTransit"),
      Icon: TruckIcon,
    },
    {
      value: "completed",
      label: t("trade.statusCompleted"),
      Icon: CheckCircleIcon,
    },
    {
      value: "cancelled",
      label: t("trade.statusCancelled"),
      Icon: XCircleIcon,
    },
    { value: "rejected", label: t("trade.statusRejected"), Icon: XCircleIcon },
  ];

  return (
    <PageShell className="pb-16">
      <PageHeader
        title={t("trade.myTrades")}
        description={t("trade.myTradesDesc")}
      />

      <Tabs
        value={statusFilter ?? "all"}
        onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}
      >
        <TabsList className="flex flex-wrap">
          {filters.map(({ value, label, Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-1.5">
              {Icon && <Icon className="w-4 h-4" />}
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded bg-border-subtle" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <div className="rounded border border-border bg-surface-elevated p-12 text-center">
          <ArrowsRightLeftIcon className="mx-auto mb-4 h-16 w-16 text-border-strong" />
          <h2 className="mb-2 text-xl font-semibold text-heading">
            {t("trade.noTrades")}
          </h2>
          <p className="mb-6 text-muted">
            {isAuthenticated
              ? t("trade.noTradesHint")
              : t("trade.tradeRequiresLogin")}
          </p>
          <Link
            href="/listings"
            className="inline-flex items-center gap-2 rounded bg-primary-500 px-6 py-3 font-medium text-inverted transition-colors hover:bg-primary-600"
          >
            {t("cart.browseListings")}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {trades.map((trade) => (
            <TradeCard key={trade.id} trade={trade} currentUserId={user?.id} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
