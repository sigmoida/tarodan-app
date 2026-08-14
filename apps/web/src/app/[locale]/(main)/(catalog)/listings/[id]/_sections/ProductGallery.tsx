/** @format */

"use client";

import {
  ArrowsRightLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef } from "react";
import { Badge, Button } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { useSwipe } from "@/hooks/useSwipe";
import { IMAGE_SIZES } from "@/lib/imageSizes";
import { PLACEHOLDER } from "../_lib/images";
import { useListingDetail } from "../_context/ListingDetailContext";

/**
 * Görsel ileri/geri düğmesi — görselin üzerinde duran beyaz daire.
 *
 * Düğmenin KENDİSİ hover'da değişmez (eskiden tamamı turuncuya dönüp görselin
 * önünde dikkat çeken bir blok oluyordu); yalnız chevron renklenir. Bu yüzden
 * `Button`'ın secondary hover arka planı `hover:bg-surface-elevated` ile
 * bilerek nötrleniyor.
 */
function GalleryNavButton({
  side,
  label,
  onClick,
  onMouseEnter,
}: {
  side: "left" | "right";
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter: () => void;
}) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <Button
      variant="secondary"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`group absolute top-1/2 z-10 h-12 w-12 -translate-y-1/2 rounded-full border-0 bg-surface-elevated p-0 shadow-lg hover:bg-surface-elevated ${
        side === "left" ? "left-4" : "right-4"
      }`}
    >
      <Icon className="h-6 w-6 text-body transition-colors group-hover:text-primary-600" />
    </Button>
  );
}

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

  // İleri/geri tek yerde: eskiden aynı "başa/sona sar" hesabı iki düğmenin
  // içinde ayrı ayrı duruyordu, şimdi kaydırma jesti de aynı ikisini çağırıyor.
  const total = images.length;
  const goNext = useCallback(() => {
    setActiveImageIndex(
      activeImageIndex < total - 1 ? activeImageIndex + 1 : 0,
    );
  }, [activeImageIndex, total, setActiveImageIndex]);
  const goPrev = useCallback(() => {
    setActiveImageIndex(
      activeImageIndex > 0 ? activeImageIndex - 1 : total - 1,
    );
  }, [activeImageIndex, total, setActiveImageIndex]);

  const { swipeHandlers, consumeSwipeClick } = useSwipe({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
  });

  // Kaydırarak ilerleyince küçük görsel şeridi yerinde kalıyordu: aktif görselin
  // karesi görünür alanın dışına çıkıyor, kullanıcı kaçıncı görselde olduğunu
  // kaybediyordu. `nearest` en az kaydırmayı yapar — sayfayı dikey oynatmaz.
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    thumbRefs.current[activeImageIndex]?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }, [activeImageIndex]);

  if (!listing) return null;

  return (
    <div className="relative">
      {/* Main image + hover magnifier */}
      {/*
        `touch-pan-y`: dikey sayfa kaydırması tarayıcıda kalsın, yatay hareketi
        biz yorumlayalım. `onClick` büyütme ekranını açtığı için kaydırmanın
        ardından gelen tıklama `consumeSwipeClick` ile yutulur — yoksa görseli
        değiştirmek isteyen kullanıcı büyütme ekranında buluyordu kendini.
      */}
      <div
        ref={setImageContainerRef}
        className="relative aspect-square touch-pan-y bg-surface-elevated rounded overflow-visible shadow-sm cursor-zoom-in"
        onClick={() => {
          if (consumeSwipeClick()) return;
          openLightbox(activeImageIndex);
        }}
        onMouseMove={handleMagnifierMouseMove}
        onMouseLeave={handleMagnifierMouseLeave}
        {...swipeHandlers}
      >
        <OptimizedImage
          src={images[activeImageIndex]}
          alt={listing.title}
          fill
          sizes={IMAGE_SIZES.productHero}
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
            <GalleryNavButton
              side="left"
              label={t("common.previous")}
              onMouseEnter={() => setShowMagnifier(false)}
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
            />
            <GalleryNavButton
              side="right"
              label={t("common.next")}
              onMouseEnter={() => setShowMagnifier(false)}
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
            />
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
          <span className="text-xs font-semibold">360°</span>
        </Button>

        {images.map((img, index) => (
          <Button
            variant="secondary"
            key={index}
            ref={(node) => {
              thumbRefs.current[index] = node;
            }}
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
              sizes="80px"
              className="object-cover"
              logContext={{ page: "listing-detail-thumb" }}
            />
          </Button>
        ))}
      </div>
    </div>
  );
}
