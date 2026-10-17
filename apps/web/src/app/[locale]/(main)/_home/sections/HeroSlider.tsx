/** @format */

"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import type { HeroSlideDto } from "@tarodan/types";
import { Button } from "@tarodan/ui";
import HeroSlideItem from "./HeroSlideItem";

const AUTOPLAY_MS = 10000;
const SWIPE_THRESHOLD = 50;

/** Kodda tanımlı sabit slaytın nokta/anahtar kimliği. */
const PINNED_ID = "pinned";

/**
 * Slayt yoksa (boş liste / API hatası / web hero anahtarı kapalı) bölüm hiç
 * çizilmez — `pinned` verilmiş olsa bile. `pinned`, admin slaytlarından ÖNCE
 * gelen kodda tanımlı ilk slayttır (tam genişlikte `flex-shrink-0` bir öğe);
 * verildiğinde sayfanın `<h1>`'i onundur, admin slaytları `<h2>` olur.
 */
export default function HeroSlider({
  slides,
  pinned,
}: {
  slides: HeroSlideDto[];
  pinned?: ReactNode;
}) {
  if (slides.length === 0) return null;
  return <HeroCarousel slides={slides} pinned={pinned} />;
}

function HeroCarousel({
  slides,
  pinned,
}: {
  slides: HeroSlideDto[];
  pinned?: ReactNode;
}) {
  const t = useTranslations();
  const ids = [...(pinned ? [PINNED_ID] : []), ...slides.map((s) => s.id)];
  const count = ids.length;

  const [current, setCurrent] = useState(0);
  const goTo = useCallback(
    (i: number) => setCurrent((i + count) % count),
    [count],
  );

  // Auto-advance (tek slaytta dönecek bir şey yok).
  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(
      () => setCurrent((p) => (p + 1) % count),
      AUTOPLAY_MS,
    );
    return () => clearInterval(id);
  }, [count]);

  // Lightweight swipe: compare start/end X against a threshold.
  const swipeStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (swipeStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    if (Math.abs(dx) > SWIPE_THRESHOLD)
      setCurrent((p) => (p + (dx < 0 ? 1 : -1) + count) % count);
    swipeStartX.current = null;
  };

  return (
    /*
      Hero, sayfadaki diğer bölümlerle AYNI kabuk: yükseltilmiş yüzey + kenarlık
      + yuvarlatma, yani `HomeSection`'ın kullandığı `SectionCard` görünümü.
    */
    <section className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      {/* Track: all slides in a row, shifted by translateX (dynamic → inline). */}
      <div
        className="flex touch-pan-y transition-transform duration-500 ease-premium"
        style={{ transform: `translateX(-${current * 100}%)` }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {pinned}
        {slides.map((slide, i) => (
          <HeroSlideItem
            key={slide.id}
            slide={slide}
            isFirst={!pinned && i === 0}
          />
        ))}
      </div>

      {/* Slide indicators — akış içinde, kartın altında. Mutlak konumdayken
          mobilde kısalan dolgu yüzünden içeriğin üstüne biniyordu. */}
      {count > 1 && (
        <div className="flex justify-center gap-2 pb-6">
          {ids.map((id, index) => (
            <Button
              variant="secondary"
              key={id}
              onClick={() => goTo(index)}
              className={`h-2 rounded-full transition-all duration-300 ease-premium ${
                index === current
                  ? "bg-primary-500 w-8"
                  : "bg-border-strong w-2 hover:bg-subtle"
              }`}
              aria-label={t("home.slider.goToSlide", { index: index + 1 })}
            />
          ))}
        </div>
      )}
    </section>
  );
}
