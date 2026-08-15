/** @format */

"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlusIcon, ClockIcon } from "@heroicons/react/24/outline";
import {
  Alert,
  Badge,
  Button,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@tarodan/ui";
import BoostModal from "./_modals/BoostModal";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyStateCard } from "@/components/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAuthStore } from "@/stores/authStore";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import {
  useMyListings,
  useDeleteListing,
  useDeactivateListing,
} from "./_hooks/useMyListings";
import { useCommissionPreviews } from "../_hooks/useCommissionPreviews";
import { FILTER_TABS } from "./_lib/status";
import type { Listing } from "./_lib/types";
import ListingCard from "./_components/ListingCard";
import { useTranslations } from "next-intl";

export default function ProfileListingsPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const { ready } = useRequireAuth();
  const user = useAuthStore((s) => s.user);
  const isPremiumUser =
    !!(user as any)?.membershipTier && (user as any).membershipTier !== "free";

  const [activeFilter, setActiveFilter] = useState(
    searchParams.get("status") || "all",
  );
  const [boostTarget, setBoostTarget] = useState<Listing | null>(null);

  const { listings, isLoading } = useMyListings(activeFilter, ready);
  const estimatedNets = useCommissionPreviews(
    listings.map((l) => ({
      id: l.id,
      amount: Number(l.price) || 0,
      categoryId: l.category?.id,
      packageTier: l.shippingPackageTier,
    })),
  );
  const deleteMutation = useDeleteListing();
  const deactivateMutation = useDeactivateListing();

  const pendingCount = listings.filter((l) => l.status === "pending").length;

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t("profile.listingsPage.ilaniSil"),
      description: t(
        "profile.listingsPage.buIlaniSilmekIstediginizeEminMisiniz",
      ),
      confirmLabel: t("page.listings.page.sil"),
      destructive: true,
    });
    if (ok) deleteMutation.mutate(id);
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <PageShell className="pb-16">
      <PageHeader
        title={t("profile.listingsPage.ilanlarim")}
        description={t(
          "profile.listingsPage.tumIlanlariniTekYerdenYonetDuzenle",
        )}
        actions={
          <ButtonLink href="/listings/new" className="gap-2">
            <PlusIcon className="h-5 w-5" />
            {t("product.newListing")}
          </ButtonLink>
        }
      />

      <Tabs value={activeFilter} onValueChange={setActiveFilter}>
        <TabsList className="w-full">
          {FILTER_TABS(t).map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              {tab.label}
              {tab.value === "pending" && pendingCount > 0 && (
                <Badge
                  variant="warning"
                  appearance="solid"
                  size="sm"
                  className="rounded-full px-1.5"
                >
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {pendingCount > 0 && activeFilter !== "pending" && (
        <Alert
          variant="warning"
          icon={<ClockIcon className="h-5 w-5 text-warning-600" />}
          title={t("profile.listingsPage.pendingcountIlaninizOnayBekliyor", {
            pendingCount,
          })}
        >
          {t(
            "profile.listingsPage.ilanlarAdminTarafindanOnaylandiktanSonraYayina",
          )}
        </Alert>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border border-border bg-surface-elevated p-4"
            >
              <div className="mb-4 aspect-square rounded bg-border-subtle" />
              <div className="mb-2 h-5 w-3/4 rounded bg-border-subtle" />
              <div className="h-4 w-1/2 rounded bg-border-subtle" />
            </div>
          ))}
        </div>
      ) : listings.length === 0 ? (
        <EmptyStateCard
          title={
            activeFilter !== "all"
              ? t("profile.listingsPage.buFiltreyeUygunIlanYok")
              : t("profile.listingsPage.henuzIlaninizYok")
          }
          description={t(
            "profile.listingsPage.koleksiyonunuzdakiUrunleriSatisaCikarin",
          )}
          action={
            <ButtonLink href="/listings/new">
              {t("profile.listingsPage.ilkIlaniniziOlusturun")}
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing, index) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              index={index}
              estimatedNet={estimatedNets[listing.id]}
              isDeleting={
                deleteMutation.isPending &&
                deleteMutation.variables === listing.id
              }
              isDeactivating={
                deactivateMutation.isPending &&
                deactivateMutation.variables === listing.id
              }
              onDelete={handleDelete}
              onDeactivate={(id) => deactivateMutation.mutate(id)}
              onBoost={setBoostTarget}
            />
          ))}
        </div>
      )}

      {boostTarget && (
        <BoostModal
          listingId={boostTarget.id}
          listingTitle={boostTarget.title}
          boostedUntil={boostTarget.boostedUntil ?? null}
          isPremium={isPremiumUser}
          open={!!boostTarget}
          onClose={() => setBoostTarget(null)}
        />
      )}
    </PageShell>
  );
}
