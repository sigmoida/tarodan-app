/** @format */

"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from "@heroicons/react/24/outline";
import { Button, IconButton } from "@tarodan/ui";
import MediaDialog from "@/components/MediaDialog";
import OptimizedImage from "@/components/OptimizedImage";
import { PLACEHOLDER } from "../_lib/images";
import { useListingDetail } from "../_context/ListingDetailContext";

export default function ProductLightbox() {
  const {
    listing,
    t,
    images,
    isLightboxOpen,
    lightboxImageIndex,
    setLightboxImageIndex,
    zoomLevel,
    setZoomLevel,
    panPosition,
    setPanPosition,
    isDragging,
    closeLightbox,
    handleZoomIn,
    handleZoomOut,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useListingDetail();

  if (!listing) return null;

  return (
    <MediaDialog
      open={isLightboxOpen}
      onClose={closeLightbox}
      title={<span className="block truncate">{listing.title}</span>}
      closeLabel={t("common.close")}
      footer={
        images.length > 1 ? (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
              {images.map((img, index) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  key={index}
                  onClick={() => {
                    setLightboxImageIndex(index);
                    setZoomLevel(1);
                    setPanPosition({ x: 0, y: 0 });
                  }}
                  aria-label={`${index + 1} / ${images.length}`}
                  className={`relative h-12 w-12 flex-shrink-0 overflow-hidden rounded border-2 p-0 transition-colors ${
                    index === lightboxImageIndex
                      ? "border-primary-500"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  <OptimizedImage
                    src={img}
                    alt=""
                    fill
                    className="object-cover"
                    logContext={{ page: "listing-detail-lightbox-thumb" }}
                  />
                </Button>
              ))}
            </div>
            <span className="shrink-0 text-sm tabular-nums text-muted">
              {lightboxImageIndex + 1} / {images.length}
            </span>
          </div>
        ) : undefined
      }
    >
      <div
        className="relative flex h-full min-h-[18rem] items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          cursor:
            zoomLevel > 1 ? (isDragging ? "grabbing" : "grab") : "default",
        }}
      >
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <IconButton
            variant="ghost"
            aria-label={t("common.zoomIn")}
            onClick={handleZoomIn}
            className="h-10 w-10 bg-surface-elevated/10 text-inverted hover:bg-surface-elevated/20"
            disabled={zoomLevel >= 3}
          >
            <MagnifyingGlassPlusIcon className="h-5 w-5" />
          </IconButton>
          <IconButton
            variant="ghost"
            aria-label={t("common.zoomOut")}
            onClick={handleZoomOut}
            className="h-10 w-10 bg-surface-elevated/10 text-inverted hover:bg-surface-elevated/20"
            disabled={zoomLevel <= 1}
          >
            <MagnifyingGlassMinusIcon className="h-5 w-5" />
          </IconButton>
        </div>

        <div
          className="relative"
          style={{
            transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
            transition: isDragging ? "none" : "transform 0.2s ease-out",
          }}
        >
          <OptimizedImage
            src={images[lightboxImageIndex]}
            alt={listing.title}
            width={1200}
            height={1200}
            className="max-h-[calc(100dvh-10rem)] max-w-[calc(100vw-4rem)] object-contain"
            fallbackSrc={PLACEHOLDER}
            logContext={{
              listingId: listing.id,
              page: "listing-detail-lightbox",
            }}
          />
        </div>

        {images.length > 1 && (
          <>
            <IconButton
              variant="ghost"
              aria-label={t("common.previous")}
              onClick={() => {
                setLightboxImageIndex(
                  lightboxImageIndex > 0
                    ? lightboxImageIndex - 1
                    : images.length - 1,
                );
                setZoomLevel(1);
                setPanPosition({ x: 0, y: 0 });
              }}
              className="absolute left-4 top-1/2 z-10 h-12 w-12 -translate-y-1/2 bg-surface-elevated/10 text-inverted hover:bg-surface-elevated/20"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </IconButton>
            <IconButton
              variant="ghost"
              aria-label={t("common.next")}
              onClick={() => {
                setLightboxImageIndex(
                  lightboxImageIndex < images.length - 1
                    ? lightboxImageIndex + 1
                    : 0,
                );
                setZoomLevel(1);
                setPanPosition({ x: 0, y: 0 });
              }}
              className="absolute right-4 top-1/2 z-10 h-12 w-12 -translate-y-1/2 bg-surface-elevated/10 text-inverted hover:bg-surface-elevated/20"
            >
              <ChevronRightIcon className="h-6 w-6" />
            </IconButton>
          </>
        )}
      </div>
    </MediaDialog>
  );
}
