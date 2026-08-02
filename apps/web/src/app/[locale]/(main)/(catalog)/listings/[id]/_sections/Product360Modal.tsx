/** @format */

"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  PlayIcon,
  PauseIcon,
} from "@heroicons/react/24/outline";
import { Button, IconButton } from "@tarodan/ui";
import MediaDialog from "@/components/MediaDialog";
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

  if (!listing) return null;

  return (
    <MediaDialog
      open={show360Modal}
      onClose={close360View}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <ArrowPathIcon
            className={`h-5 w-5 shrink-0 text-primary-500 ${
              is360Playing ? "animate-spin" : ""
            }`}
            aria-hidden="true"
          />
          <span className="truncate">{t("product.view360")}</span>
        </span>
      }
      closeLabel={t("common.close")}
      footer={
        <div className="flex w-full items-center justify-center gap-4">
          <Button onClick={toggle360Play} className="gap-2">
            {is360Playing ? (
              <PauseIcon className="h-5 w-5" aria-hidden="true" />
            ) : (
              <PlayIcon className="h-5 w-5" aria-hidden="true" />
            )}
            {is360Playing ? t("product.pause") : t("product.autoRotate")}
          </Button>
          <span className="text-sm tabular-nums text-muted">
            {view360Index + 1} / {images.length}
          </span>
        </div>
      }
    >
      <div className="flex h-full items-center justify-center p-4">
        <div className="relative aspect-square h-auto max-h-full w-full max-w-4xl overflow-hidden">
          <OptimizedImage
            src={images[view360Index]}
            alt={`${listing.title} - ${view360Index + 1}`}
            fill
            className="object-contain"
            fallbackSrc={PLACEHOLDER}
            logContext={{ listingId: listing.id, page: "listing-detail-360" }}
          />

          <IconButton
            variant="ghost"
            aria-label={t("common.previous")}
            onClick={() =>
              setView360Index(
                view360Index > 0 ? view360Index - 1 : images.length - 1,
              )
            }
            className="absolute left-4 top-1/2 h-12 w-12 -translate-y-1/2 bg-surface-elevated/80 text-heading shadow-sm hover:bg-surface-elevated"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </IconButton>
          <IconButton
            variant="ghost"
            aria-label={t("common.next")}
            onClick={() =>
              setView360Index(
                view360Index < images.length - 1 ? view360Index + 1 : 0,
              )
            }
            className="absolute right-4 top-1/2 h-12 w-12 -translate-y-1/2 bg-surface-elevated/80 text-heading shadow-sm hover:bg-surface-elevated"
          >
            <ChevronRightIcon className="h-6 w-6" />
          </IconButton>

          {/* Progress dots */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex gap-1">
              {images.map((_, index) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  key={index}
                  onClick={() => setView360Index(index)}
                  aria-label={`${index + 1} / ${images.length}`}
                  className={`h-1.5 flex-1 rounded-sm p-0 transition-all ${
                    index === view360Index
                      ? "bg-primary-500"
                      : "bg-border-strong hover:bg-subtle"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </MediaDialog>
  );
}
