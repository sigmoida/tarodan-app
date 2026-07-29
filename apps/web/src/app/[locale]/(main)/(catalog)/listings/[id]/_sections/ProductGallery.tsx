/** @format */

"use client";

import {
  ArrowsRightLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { PLACEHOLDER } from "../_lib/images";
import { useListingDetail } from "../_context/ListingDetailContext";

export default function ProductGallery() {
  const {
    listing,
    t,
    images,
    isTradeAvailable,
    activeImageIndex,
    setActiveImageIndex,
    openLightbox,
    showMagnifier,
    setShowMagnifier,
    magnifierPosition,
    imageContainerRef,
    setImageContainerRef,
    zoomPreviewRef,
    handleMagnifierMouseMove,
    handleMagnifierMouseLeave,
    open360View,
  } = useListingDetail();

  if (!listing) return null;

  return (
    <div className="relative">
      {/* Main image + hover magnifier */}
      <div
        ref={setImageContainerRef}
        className="relative aspect-square bg-surface-elevated rounded overflow-visible shadow-sm cursor-zoom-in"
        onClick={() => openLightbox(activeImageIndex)}
        onMouseMove={handleMagnifierMouseMove}
        onMouseLeave={handleMagnifierMouseLeave}
      >
        <OptimizedImage
          src={images[activeImageIndex]}
          alt={listing.title}
          fill
          className="object-cover rounded"
          fallbackSrc={PLACEHOLDER}
          logContext={{ listingId: listing.id, page: "listing-detail-main" }}
          priority
        />

        {/* Square magnifier viewport */}
        {showMagnifier && imageContainerRef && (
          <div
            className="absolute pointer-events-none z-20"
            style={{
              left: `${magnifierPosition.x}px`,
              top: `${magnifierPosition.y}px`,
              transform: "translate(-50%, -50%)",
              width: "150px",
              height: "150px",
              border: "2px solid rgba(255, 140, 0, 0.8)",
              boxShadow: "0 0 15px rgba(0, 0, 0, 0.3)",
              overflow: "hidden",
              background: "rgba(255, 255, 255, 0.2)",
              borderRadius: "4px",
            }}
          />
        )}

        {isTradeAvailable && (
          <div className="absolute top-4 left-4 z-10">
            <Badge
              variant="success"
              icon={<ArrowsRightLeftIcon className="w-4 h-4" />}
            >
              {t("product.tradeAvailable")}
            </Badge>
          </div>
        )}

        {images.length > 1 && (
          <>
            <Button
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                setActiveImageIndex(
                  activeImageIndex > 0
                    ? activeImageIndex - 1
                    : images.length - 1,
                );
              }}
              onMouseEnter={() => setShowMagnifier(false)}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-surface-elevated/90 rounded-full flex items-center justify-center hover:bg-primary-500 hover:text-inverted transition-colors z-10 group"
            >
              <ChevronLeftIcon className="w-6 h-6 text-body group-hover:text-inverted transition-colors" />
            </Button>
            <Button
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                setActiveImageIndex(
                  activeImageIndex < images.length - 1
                    ? activeImageIndex + 1
                    : 0,
                );
              }}
              onMouseEnter={() => setShowMagnifier(false)}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-surface-elevated/90 rounded-full flex items-center justify-center hover:bg-primary-500 hover:text-inverted transition-colors z-10 group"
            >
              <ChevronRightIcon className="w-6 h-6 text-body group-hover:text-inverted transition-colors" />
            </Button>
          </>
        )}
      </div>

      {/* Large zoom preview — opens like a modal, can cover the text to the right */}
      {showMagnifier && imageContainerRef && (
        <div
          className="absolute left-full top-0 ml-4 w-full aspect-square bg-surface-elevated rounded overflow-hidden shadow-2xl hidden md:block z-50"
          style={{ maxWidth: "600px" }}
        >
          <div
            ref={zoomPreviewRef}
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${images[activeImageIndex]})`,
              backgroundSize: `${imageContainerRef.offsetWidth * 3}px ${imageContainerRef.offsetHeight * 3}px`,
              backgroundRepeat: "no-repeat",
              willChange: "background-position",
            }}
          />
        </div>
      )}

      {/* 360° button + thumbnails */}
      <div className="flex gap-2 mt-4 overflow-x-auto pb-2 items-center">
        <Button
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            open360View();
          }}
          className={`flex-shrink-0 w-20 h-20 rounded flex flex-col items-center justify-center transition-all shadow-md ${
            images.length > 1
              ? "bg-gradient-to-br from-primary-500 to-primary-600 text-inverted hover:from-primary-600 hover:to-primary-700"
              : "bg-border-subtle text-subtle cursor-not-allowed"
          }`}
          title={t("product.view360")}
          disabled={images.length <= 1}
        >
          <ArrowPathIcon className="w-6 h-6 mb-1" />
          <span className="text-xs font-semibold">360°</span>
        </Button>

        {images.map((img, index) => (
          <Button
            variant="secondary"
            key={index}
            onClick={() => {
              setActiveImageIndex(index);
              openLightbox(index);
            }}
            className={`relative w-20 h-20 rounded overflow-hidden flex-shrink-0 border-2 transition-colors ${
              index === activeImageIndex
                ? "border-primary-500"
                : "border-transparent"
            }`}
          >
            <OptimizedImage
              src={img}
              alt=""
              fill
              className="object-cover"
              logContext={{ page: "listing-detail-thumb" }}
            />
          </Button>
        ))}
      </div>
    </div>
  );
}
