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
import ListingRemovalModal from "@/components/listings/ListingRemovalModal";
import type { SellerRemovalAction } from "@/components/listings/listingRemovalSchema";
import { useAuthStore } from "@/stores/authStore";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import {
  useMyListings,
  useDeleteListing,
  useDeactivateListing,
} from "./_hooks/useMyListings";
import { useCommissionPreviews } from "../_hooks/useCommissionPreviews";
import { EXPIRED_FILTER, FILTER_TABS } from "./_lib/status";
import type { Listing } from "./_lib/types";
import ListingCard from "./_components/ListingCard";
import {
  ExpiredListingCheckbox,
  ExpiredListingsBanner,
  ExpiredSelectionBar,
} from "./_components/ExpiredListingsBar";
import {
  useListingSelection,
  useRenewListing,
  useRenewListings,
} from "./_hooks/useRenewListings";
import { useTranslations } from "next-intl";

export default function ProfileListingsPage() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const { ready } = useRequireAuth();
  const user = useAuthStore((s) => s.user);
  const isPremiumUser =
    !!(user as any)?.membershipTier && (user as any).membershipTier !== "free";

  const [activeFilter, setActiveFilter] = useState(
    searchParams.get("status") || "all",
  );
  const [boostTarget, setBoostTarget] = useState<Listing | null>(null);
  // Silme ve pasife alma önce NEDEN sorar; hangi ilan, hangi eylem.
  const [removalTarget, setRemovalTarget] = useState<{
    id: string;
    action: SellerRemovalAction;
  } | null>(null);

  const { listings, isLoading } = useMyListings(activeFilter, ready);
  // Süresi dolan ilan sayısı her sekmede banner'ı besler; expired sekmesindeyken
  // aynı sorgu (aynı anahtar) yeniden kullanılır.
  const { listings: expiredListings } = useMyListings(EXPIRED_FILTER, ready);
  const isExpiredTab = activeFilter === EXPIRED_FILTER;
  const selection = useListingSelection(listings);
  const renewMutation = useRenewListing();
  const renewManyMutation = useRenewListings();
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

  const removalMutation =
    removalTarget?.action === "deactivate"
      ? deactivateMutation
      : deleteMutation;

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

      {expiredListings.length > 0 && !isExpiredTab && (
        <ExpiredListingsBanner
          count={expiredListings.length}
          onShow={() => setActiveFilter(EXPIRED_FILTER)}
        />
      )}

      {isExpiredTab && listings.length > 0 && (
        <ExpiredSelectionBar
          selectedCount={selection.selectedCount}
          allSelected={selection.allSelected}
          isRenewing={renewManyMutation.isPending}
          onToggleAll={selection.toggleAll}
          onClear={selection.clear}
          onRenew={() =>
            renewManyMutation.mutate(
              listings.filter((l) => selection.selected.has(l.id)),
              { onSuccess: selection.clear },
            )
          }
        />
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
            isExpiredTab
              ? t("profile.expiredListings.empty")
              : activeFilter !== "all"
                ? t("profile.listingsPage.buFiltreyeUygunIlanYok")
                : t("profile.listingsPage.henuzIlaninizYok")
          }
          description={
            isExpiredTab
              ? t("profile.expiredListings.emptyDescription")
              : t(
                  "profile.listingsPage.koleksiyonunuzdakiUrunleriSatisaCikarin",
                )
          }
          action={
            <ButtonLink href="/listings/new">
              {t("profile.listingsPage.ilkIlaniniziOlusturun")}
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing, index) => (
            <div key={listing.id} className="relative">
              {isExpiredTab && (
                <ExpiredListingCheckbox
                  checked={selection.selected.has(listing.id)}
                  onToggle={() => selection.toggle(listing.id)}
                />
              )}
              <ListingCard
                listing={listing}
                index={index}
                estimatedNet={estimatedNets[listing.id]}
                isDeleting={
                  deleteMutation.isPending &&
                  deleteMutation.variables?.id === listing.id
                }
                isDeactivating={
                  deactivateMutation.isPending &&
                  deactivateMutation.variables?.id === listing.id
                }
                isRenewing={
                  renewMutation.isPending &&
                  renewMutation.variables === listing.id
                }
                onDelete={(id) => setRemovalTarget({ id, action: "delete" })}
                onDeactivate={(id) =>
                  setRemovalTarget({ id, action: "deactivate" })
                }
                onRenew={(id) => renewMutation.mutate(id)}
                onBoost={setBoostTarget}
              />
            </div>
          ))}
        </div>
      )}

      {removalTarget && (
        <ListingRemovalModal
          // Her açılış taze bir form: ilan ya da eylem değişince yeniden kurulur.
          key={`${removalTarget.action}:${removalTarget.id}`}
          action={removalTarget.action}
          open
          onClose={() => setRemovalTarget(null)}
          isSubmitting={removalMutation.isPending}
          onSubmit={(removal) =>
            removalMutation.mutate(
              { id: removalTarget.id, removal },
              { onSuccess: () => setRemovalTarget(null) },
            )
          }
        />
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
