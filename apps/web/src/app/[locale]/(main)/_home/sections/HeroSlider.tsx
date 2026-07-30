/** @format */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Button } from "@tarodan/ui";
import { HERO_SLIDES } from "../lib/heroSlides";

const AUTOPLAY_MS = 10000;
const SWIPE_THRESHOLD = 50;

export default function HeroSlider() {
  const t = useTranslations();
  const slides = HERO_SLIDES;
  const count = slides.length;

  const [current, setCurrent] = useState(0);
  const goTo = useCallback(
    (i: number) => setCurrent((i + count) % count),
    [count],
  );

  // Auto-advance.
  useEffect(() => {
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
      Eskiden düz `bg-surface` üzerinde, kenarlıksız ve konteynerin kenarına
      dayalıydı — kart dizisinin arasındaki tek yassı bölümdü. İç dolgu da
      metni ve görseli diğer bölümlere göre bir kademe içeri alıyor.
    */
    <section className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      {/* Track: all slides in a row, shifted by translateX (dynamic → inline). */}
      <div
        className="flex touch-pan-y transition-transform duration-500 ease-premium"
        style={{ transform: `translateX(-${current * 100}%)` }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {slides.map((slide, i) => (
          <div key={i} className="w-full flex-shrink-0">
            <div className="px-5 py-8 sm:px-8 md:px-10 md:py-14 lg:px-14 lg:py-16">
              <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
                {/*
                  Sıralama: mobilde HER ZAMAN görsel üstte, metin altta — dar
                  ekranda iki sütunluk "yan yana" kurgusunun bir karşılığı yok
                  ve görselin altta kalması onu ekran dışına itiyordu.
                  `md`'den itibaren slaytın kendi tarafı geçerli.
                */}
                <div
                  className={`order-2 ${slide.imageRight ? "md:order-1" : "md:order-2"}`}
                >
                  <h1 className="mb-4 whitespace-pre-line font-display text-3xl font-bold leading-[1.1] tracking-tight text-heading md:mb-6 md:text-4xl lg:text-[3.25rem]">
                    {t(slide.titleKey)}
                  </h1>
                  <p className="mb-6 max-w-lg text-base leading-relaxed text-muted md:text-lg">
                    {t(slide.subtitleKey)}
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <ButtonLink variant="primary" href={slide.cta1.href}>
                      {t(slide.cta1.labelKey)}
                    </ButtonLink>
                    <ButtonLink variant="secondary" href={slide.cta2.href}>
                      {t(slide.cta2.labelKey)}
                    </ButtonLink>
                  </div>
                </div>

                {/*
                  Görsel mobilde de görünür. `hidden md:block` idi: dar ekranda
                  hero yalnız metinden ibaret kalıp boş ve yarım duruyordu.
                  Oran mobilde daha geniş (16/10) — 4/3 dikey alanın yarısını
                  yiyip başlığı katlanın altına itiyordu.
                */}
                <div
                  className={`relative order-1 aspect-[16/10] w-full overflow-hidden rounded-lg bg-surface md:aspect-[4/3] ${
                    slide.imageRight ? "md:order-2" : "md:order-1"
                  }`}
                >
                  <Image
                    src={slide.image}
                    alt={t("home.slider.imageAlt")}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 45vw, 560px"
                    className="object-cover object-center"
                    priority={i === 0}
                    quality={90}
                    unoptimized={slide.image.startsWith("http")}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Slide indicators — akış içinde, kartın altında. Mutlak konumdayken
          mobilde kısalan dolgu yüzünden içeriğin üstüne biniyordu. */}
      <div className="flex justify-center gap-2 pb-6">
        {slides.map((_, index) => (
          <Button
            variant="secondary"
            key={index}
            onClick={() => goTo(index)}
            className={`h-2 rounded-full transition-all duration-300 ease-premium ${
              index === current
                ? "bg-primary-500 w-8"
                : "bg-border-strong w-2 hover:bg-subtle"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
