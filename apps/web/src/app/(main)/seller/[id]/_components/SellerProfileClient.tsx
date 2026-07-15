/** @format */

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  CubeIcon,
  StarIcon,
  RectangleStackIcon,
} from "@heroicons/react/24/outline";
import { Badge, Spinner, Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyStateCard, ButtonLink } from "@/components/ui";
import { withChunkErrorLogging } from "@/lib/withChunkErrorLogging";
import { useSellerProfile } from "../_hooks/useSellerProfile";
import type { SellerTab } from "../_lib/types";
import SellerHeader from "./SellerHeader";
import ListingsTab from "./tabs/ListingsTab";
import ReviewsTab from "./tabs/ReviewsTab";
import CollectionsTab from "./tabs/CollectionsTab";

const ReportModal = dynamic(
  withChunkErrorLogging(
    () => import("@/components/ReportModal"),
    "ReportModal",
  ),
  { ssr: false },
);

export default function SellerProfileClient() {
  const {
    t,
    locale,
    seller,
    isLoading,
    products,
    isFollowing,
    reviews,
    reviewsLoading,
    collections,
    collectionsLoading,
    ratingStats,
    isOwnProfile,
    membershipDuration,
    showReportModal,
    setShowReportModal,
    authModal,
    handleFollow,
    handleMessage,
    handleReport,
  } = useSellerProfile();

  const [tab, setTab] = useState<SellerTab>("listings");

  if (isLoading) {
    return (
      <PageShell className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="xl" />
      </PageShell>
    );
  }

  if (!seller) {
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-6xl">
          <EmptyStateCard
            title={t("seller.notFound")}
            description={t("seller.notFoundDesc")}
            action={
              <ButtonLink variant="primary" href="/listings">
                {t("seller.backToListings")}
              </ButtonLink>
            }
          />
        </div>
      </PageShell>
    );
  }

  const totalRatings = seller.stats?.totalRatings ?? 0;
  const averageRating = seller.stats?.averageRating ?? 0;

  return (
    <PageShell>
      <SellerHeader
        seller={seller}
        listingCount={products.length}
        isFollowing={isFollowing}
        isOwnProfile={isOwnProfile}
        membershipDuration={membershipDuration}
        onMessage={handleMessage}
        onFollow={handleFollow}
        onReport={handleReport}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as SellerTab)}>
        <TabsList>
          <TabsTrigger value="listings">
            <span className="flex items-center gap-2">
              <CubeIcon className="h-4 w-4" />
              {t("nav.listings")}
              <Badge variant="secondary" size="sm">
                {products.length}
              </Badge>
            </span>
          </TabsTrigger>
          <TabsTrigger value="reviews">
            <span className="flex items-center gap-2">
              <StarIcon className="h-4 w-4" />
              {t("review.reviews")}
              <Badge variant="secondary" size="sm">
                {totalRatings}
              </Badge>
            </span>
          </TabsTrigger>
          <TabsTrigger value="collections">
            <span className="flex items-center gap-2">
              <RectangleStackIcon className="h-4 w-4" />
              {t("nav.collections")}
              <Badge variant="secondary" size="sm">
                {collections.length}
              </Badge>
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "listings" && (
        <ListingsTab
          products={products}
          noActiveMessage={t("seller.noActiveListings")}
        />
      )}
      {tab === "reviews" && (
        <ReviewsTab
          reviews={reviews}
          loading={reviewsLoading}
          ratingStats={ratingStats}
          averageRating={averageRating}
          totalRatings={totalRatings}
          locale={locale}
        />
      )}
      {tab === "collections" && (
        <CollectionsTab
          collections={collections}
          loading={collectionsLoading}
        />
      )}

      {authModal}

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        entityType="user"
        entityId={seller.id}
        entityName={seller.displayName}
        locale={locale}
      />
    </PageShell>
  );
}
