/** @format */

import { forwardRef, type ReactNode } from "react";
import type { HeroImageSide } from "@tarodan/types";

/** Hero slayt başlığı (admin slaytı ve kodda tanımlı slayt aynı tipografi). */
export const HERO_TITLE_CLASS =
  "mb-4 whitespace-pre-line font-display text-3xl font-bold leading-[1.1] tracking-tight text-heading md:mb-6 md:text-4xl lg:text-[3.25rem]";

/** Başlığın altındaki açıklama metni. */
export const HERO_SUBTITLE_CLASS =
  "mb-6 max-w-lg text-base leading-relaxed text-muted md:text-lg";

/** CTA satırı: telefonda alt alta, `sm`'den itibaren yan yana. */
export const HERO_ACTIONS_CLASS = "flex flex-col gap-3 sm:flex-row";

/**
 * Tek hero slaytının iskeleti — dolgu, iki sütunlu ızgara ve görsel kutusu.
 *
 * Sıralama: mobilde HER ZAMAN görsel üstte, metin altta — dar ekranda iki
 * sütunluk "yan yana" kurgusunun bir karşılığı yok ve görselin altta kalması
 * onu ekran dışına itiyordu. `md`'den itibaren `imageSide` geçerli.
 *
 * Görsel kutusu mobilde 16/10 (4/3 dikey alanın yarısını yiyip başlığı katlanın
 * altına itiyordu), `md`'den itibaren 4/3; görsel kutuyu `fill` ile doldurur.
 * Kutu sabit oranlı olduğundan tüm slaytlar aynı yükseklikte kalır.
 */
export const HeroSlideLayout = forwardRef<
  HTMLDivElement,
  {
    imageSide: HeroImageSide;
    media: ReactNode;
    children: ReactNode;
    /** Slayt yüzeyi (ör. arka plan) — kabuğun kendisi saydamdır. */
    className?: string;
    /** Görsel kutusunun yüzeyi. */
    mediaClassName?: string;
  }
>(function HeroSlideLayout(
  { imageSide, media, children, className = "", mediaClassName = "" },
  ref,
) {
  const imageRight = imageSide === "right";
  return (
    <div ref={ref} className={`h-full w-full ${className}`}>
      <div className="px-5 py-8 sm:px-8 md:px-10 md:py-14 lg:px-14 lg:py-16">
        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          <div
            className={`order-2 ${imageRight ? "md:order-1" : "md:order-2"}`}
          >
            {children}
          </div>
          <div
            className={`relative order-1 aspect-[16/10] w-full overflow-hidden rounded-lg md:aspect-[4/3] ${
              imageRight ? "md:order-2" : "md:order-1"
            } ${mediaClassName}`}
          >
            {media}
          </div>
        </div>
      </div>
    </div>
  );
});
