"use client";

import { useState, useMemo, Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import {
  InboxArrowDownIcon,
  PaperAirplaneIcon,
  ClockIcon,
  CheckCircleIcon,
  TagIcon,
  Squares2X2Icon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { Button, Spinner, Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyStateCard } from "@/components/ui";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { useOffers, useOfferAction } from "./_hooks/useOffers";
import { useCommissionPreviews } from "../_hooks/useCommissionPreviews";
import type { Offer, OfferTab } from "./_lib/types";
import OfferCard from "./_components/OfferCard";
import CounterOfferModal from "./_modals/CounterOfferModal";
import { MetricCard } from "@/components/ui";
import { formatTL } from "@/lib/format";
import { useTranslations } from "next-intl";

function OffersPageContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const { ready } = useRequireAuth();

  const [activeTab, setActiveTab] = useState<OfferTab>(
    searchParams.get("tab") === "sent" ? "sent" : "received",
  );

  const switchTab = (tab: OfferTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  };

  const [counterState, setCounterState] = useState<{
    offer: Offer;
    mode: "buyer" | "seller";
  } | null>(null);

  const enabled = ready;
  // Both tabs are fetched so the metric cards stay tab-independent.
  const received = useOffers("received", enabled);
  const sent = useOffers("sent", enabled);
  const { run, pendingId } = useOfferAction();

  const active = activeTab === "received" ? received : sent;
  const offers = active.offers;

  const receivedPending = useMemo(
    () =>
      received.offers.filter(
        (o) => o.status === "pending" && !o.buyerMustAccept,
      ),
    [received.offers],
  );
  const estimatedNet = useCommissionPreviews(
    receivedPending.map((o) => ({
      id: o.id,
      amount: Number(o.amount),
      categoryId: o.product?.categoryId,
      packageTier: o.product?.shippingPackageTier,
    })),
  );

  // Metrics from the union of both tabs → unaffected by tab switching.
  const metrics = useMemo(() => {
    const all = [...received.offers, ...sent.offers];
    return {
      total: all.length,
      pending: all.filter((o) => o.status === "pending").length,
      accepted: all.filter((o) => o.status === "accepted").length,
      value: all.reduce((sum, o) => sum + o.amount, 0),
    };
  }, [received.offers, sent.offers]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="xl" color="border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <PageShell className="pb-16">
      <PageHeader
        title={t("page.offers.page.tekliflerim")}
        description={t(
          "offer.listPage.teklifleriniziVePazarliklariniziYonetin",
        )}
      />

      {/* Metrics — tab-independent */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          icon={Squares2X2Icon}
          label={t("offer.listPage.toplamTeklif")}
          value={metrics.total}
          accent="text-heading"
        />
        <MetricCard
          icon={ClockIcon}
          label={t("page.offers.page.bekleyen")}
          value={metrics.pending}
          accent="text-warning-600"
        />
        <MetricCard
          icon={CheckCircleIcon}
          label={t("offer.listPage.kabulEdilen")}
          value={metrics.accepted}
          accent="text-success-600"
        />
        <MetricCard
          icon={TagIcon}
          label={t("offer.listPage.toplamDeger")}
          value={formatTL(metrics.value)}
          accent="text-primary-600"
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => switchTab(v as OfferTab)}>
        <TabsList>
          <TabsTrigger value="received" className="gap-2">
            <InboxArrowDownIcon className="h-4 w-4" />
            {t("offer.receivedOffers")}
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <PaperAirplaneIcon className="h-4 w-4" />
            {t("offer.sentOffers")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {active.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="xl" color="border-primary-500 border-t-transparent" />
        </div>
      ) : active.isError ? (
        <div className="rounded-lg border border-border bg-surface-elevated py-16 text-center">
          <ExclamationCircleIcon className="mx-auto mb-4 h-16 w-16 text-danger-400" />
          <p className="mb-4 text-danger-500">
            {t("offer.listPage.tekliflerYuklenirkenBirHataOlustu")}
          </p>
        </div>
      ) : offers.length === 0 ? (
        <EmptyStateCard
          title={
            activeTab === "received"
              ? t("offer.listPage.henuzGelenTeklifYok")
              : t("offer.listPage.henuzGonderilenTeklifYok")
          }
          description={
            activeTab === "received"
              ? t(
                  "offer.listPage.alicilarIlanlarinizaTeklifVerdigindeBuradaGorunecek",
                )
              : t("offer.listPage.ilanlaraGozAtinVeIlkTeklifinizi")
          }
          action={
            <Button asChild className="gap-2">
              <Link href="/listings">
                <TagIcon className="h-5 w-5" />
                {t("offer.browseListings")}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              activeTab={activeTab}
              estimatedNet={estimatedNet[offer.id]?.sellerNetAmount}
              busy={pendingId === offer.id}
              onAction={(offerId, action, acceptAs) =>
                run({ offerId, action, acceptAs })
              }
              onSellerCounter={(o) =>
                setCounterState({ offer: o, mode: "seller" })
              }
              onBuyerCounter={(o) =>
                setCounterState({ offer: o, mode: "buyer" })
              }
            />
          ))}
        </div>
      )}

      <CounterOfferModal
        open={!!counterState}
        offer={counterState?.offer ?? null}
        mode={counterState?.mode ?? "seller"}
        onClose={() => setCounterState(null)}
      />
    </PageShell>
  );
}

export default function OffersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" color="border-primary-500 border-t-transparent" />
        </div>
      }
    >
      <OffersPageContent />
    </Suspense>
  );
}
