/** @format */

"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { withChunkErrorLogging } from "@/lib/withChunkErrorLogging";
import {
  ListingDetailProvider,
  useListingDetail,
} from "./_context/ListingDetailContext";
import ProductBreadcrumbs from "./_sections/ProductBreadcrumbs";
import ProductGallery from "./_sections/ProductGallery";
import ProductInfo from "./_sections/ProductInfo";
import ProductReviews from "./_sections/ProductReviews";
import CollectionPickerModal from "./_modals/CollectionPickerModal";
import TradePremiumModal from "./_modals/TradePremiumModal";

const ProductStaticInfoFallback = dynamic(
  () => import("./_sections/ProductStaticInfoFallback"),
  { ssr: false },
);

const ProductLightbox = dynamic(
  withChunkErrorLogging(
    () => import("./_sections/ProductLightbox"),
    "ProductLightbox",
  ),
  { ssr: false },
);

const Product360Modal = dynamic(
  withChunkErrorLogging(
    () => import("./_sections/Product360Modal"),
    "Product360Modal",
  ),
  { ssr: false },
);

const OfferModal = dynamic(
  withChunkErrorLogging(() => import("./_modals/OfferModal"), "OfferModal"),
  { ssr: false },
);

const ReportModal = dynamic(
  withChunkErrorLogging(
    () => import("@/components/ReportModal"),
    "ReportModal",
  ),
  { ssr: false },
);

function ListingDetailLayout({ staticInfo }: { staticInfo: ReactNode }) {
  const {
    t,
    locale,
    listing,
    isLoading,
    authModal,
    showReportModal,
    setShowReportModal,
    isLightboxOpen,
    show360Modal,
    showOfferModal,
  } = useListingDetail();

  if (isLoading) {
    return (
      <PageShell className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="aspect-square bg-border-subtle rounded" />
              <div className="space-y-4">
                <div className="h-8 bg-border-subtle rounded w-3/4" />
                <div className="h-6 bg-border-subtle rounded w-1/2" />
                <div className="h-10 bg-border-subtle rounded w-1/3" />
                <div className="h-32 bg-border-subtle rounded" />
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!listing) {
    return (
      <PageShell className="flex items-center justify-center">
        <p className="text-muted">{t("product.listingNotFound")}</p>
      </PageShell>
    );
  }

  const available =
    listing.availableQuantity !== undefined &&
    listing.availableQuantity !== null
      ? listing.availableQuantity
      : listing.quantity;

  return (
    <PageShell>
      <PageHeader breadcrumb={<ProductBreadcrumbs />} />

      {available === 0 && (
        <div className="p-4 bg-warning-50 border border-warning-200 rounded-xl">
          <p className="text-warning-800 font-medium">
            {t("product.stockFinished")}
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left: gallery + product reviews under it */}
        <div className="space-y-6">
          <ProductGallery />
          <ProductReviews />
        </div>
        {/* Right: info + spec cards (rendered under the seller card in ProductInfo) */}
        <div>
          {staticInfo ?? <ProductStaticInfoFallback />}
          <ProductInfo />
        </div>
      </div>

      {/* Overlays & modals */}
      {isLightboxOpen && <ProductLightbox />}
      {show360Modal && <Product360Modal />}
      <CollectionPickerModal />
      {showOfferModal && <OfferModal />}
      <TradePremiumModal />

      {authModal}

      {showReportModal && (
        <ReportModal
          isOpen
          onClose={() => setShowReportModal(false)}
          entityType="product"
          entityId={listing.id}
          entityName={listing.title}
          locale={locale}
        />
      )}
    </PageShell>
  );
}

export default function ListingDetailClient({
  staticInfo,
}: {
  staticInfo: ReactNode;
}) {
  return (
    <ListingDetailProvider>
      <ListingDetailLayout staticInfo={staticInfo} />
    </ListingDetailProvider>
  );
}
