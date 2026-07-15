/** @format */

"use client";

import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  PlayIcon,
  PauseIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { PLACEHOLDER } from "../_lib/images";
import { useListingDetail } from "../_context/ListingDetailContext";

export default function Product360Modal() {
  const {
    listing,
    t,
    images,
    show360Modal,
    is360Playing,
    view360Index,
    setView360Index,
    close360View,
    toggle360Play,
  } = useListingDetail();

  if (!show360Modal || !listing) return null;

  return (
    <div
      className="fixed inset-0 bg-heading/95 z-50 flex items-center justify-center p-4"
      onClick={close360View}
    >
      <div
        className="relative max-w-4xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center">
              <ArrowPathIcon
                className={`w-6 h-6 text-inverted ${is360Playing ? "animate-spin" : ""}`}
              />
            </div>
            <div>
              <h3 className="text-inverted font-semibold text-lg">
                {t("product.view360")}
              </h3>
              <p className="text-inverted/60 text-sm">
                {t("product.rotateToSeeAngles")}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={close360View}
            className="w-10 h-10 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </Button>
        </div>

        {/* Main image */}
        <div className="relative aspect-square bg-heading rounded overflow-hidden mb-4">
          <OptimizedImage
            src={images[view360Index]}
            alt={`${listing.title} - ${view360Index + 1}`}
            fill
            className="object-contain"
            fallbackSrc={PLACEHOLDER}
            logContext={{ listingId: listing.id, page: "listing-detail-360" }}
          />

          <Button
            variant="secondary"
            onClick={() =>
              setView360Index(
                view360Index > 0 ? view360Index - 1 : images.length - 1,
              )
            }
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              setView360Index(
                view360Index < images.length - 1 ? view360Index + 1 : 0,
              )
            }
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors"
          >
            <ChevronRightIcon className="w-6 h-6" />
          </Button>

          {/* Progress dots */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex gap-1">
              {images.map((_, index) => (
                <Button
                  variant="secondary"
                  key={index}
                  onClick={() => setView360Index(index)}
                  className={`h-1.5 flex-1 rounded-sm transition-all ${
                    index === view360Index
                      ? "bg-primary-500"
                      : "bg-surface-elevated/30 hover:bg-surface-elevated/50"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="secondary"
            onClick={toggle360Play}
            className="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-inverted rounded font-semibold transition-colors"
          >
            {is360Playing ? (
              <>
                <PauseIcon className="w-5 h-5" />
                {t("product.pause")}
              </>
            ) : (
              <>
                <PlayIcon className="w-5 h-5" />
                {t("product.autoRotate")}
              </>
            )}
          </Button>
          <div className="text-inverted/60 text-sm">
            {view360Index + 1} / {images.length}
          </div>
        </div>
      </div>
    </div>
  );
}
