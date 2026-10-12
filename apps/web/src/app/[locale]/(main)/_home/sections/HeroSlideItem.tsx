/** @format */

"use client";

import { useRef } from "react";
import { useLocale } from "next-intl";
import { pickLocalized, type HeroSlideDto } from "@tarodan/types";
import { ButtonLink } from "@/components/ui/ButtonLink";
import HeroPicture from "@/components/marketing/HeroPicture";
import { useVisibilityImpression } from "@/hooks/useVisibilityImpression";
import { trackHeroEvent, type HeroCtaIndex } from "@/lib/api/heroTracking";
import { resolveHeroCta } from "@/lib/heroView";

/**
 * Tek hero slaytı. Gösterim sayacı slayt başına çalışır: yan slaytlar `overflow`
 * ile kırpıldığından yalnız ekrandaki slayt %50 görünürlüğe ulaşır.
 * Yalnız ilk slayt `<h1>` olur (sayfada tek h1).
 */
export default function HeroSlideItem({
  slide,
  isFirst,
}: {
  slide: HeroSlideDto;
  isFirst: boolean;
}) {
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  useVisibilityImpression(ref, () => trackHeroEvent(slide.id, "impression"));

  const title = pickLocalized(slide.title, locale);
  const subtitle = pickLocalized(slide.subtitle, locale);
  const alt = pickLocalized(slide.imageAlt, locale) || title;
  const imageRight = slide.imageSide === "right";
  const Heading = isFirst ? "h1" : "h2";

  const ctas = [
    { index: 1 as HeroCtaIndex, cta: resolveHeroCta(slide.cta1, locale) },
    { index: 2 as HeroCtaIndex, cta: resolveHeroCta(slide.cta2, locale) },
  ];

  return (
    <div ref={ref} className="w-full flex-shrink-0">
      <div className="px-5 py-8 sm:px-8 md:px-10 md:py-14 lg:px-14 lg:py-16">
        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          {/*
            Sıralama: mobilde HER ZAMAN görsel üstte, metin altta — dar
            ekranda iki sütunluk "yan yana" kurgusunun bir karşılığı yok
            ve görselin altta kalması onu ekran dışına itiyordu.
            `md`'den itibaren slaytın kendi tarafı geçerli.
          */}
          <div className={`order-2 ${imageRight ? "md:order-1" : "md:order-2"}`}>
            <Heading className="mb-4 whitespace-pre-line font-display text-3xl font-bold leading-[1.1] tracking-tight text-heading md:mb-6 md:text-4xl lg:text-[3.25rem]">
              {title}
            </Heading>
            {subtitle && (
              <p className="mb-6 max-w-lg text-base leading-relaxed text-muted md:text-lg">
                {subtitle}
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              {ctas.map(({ index, cta }) =>
                cta ? (
                  <ButtonLink
                    key={index}
                    variant={index === 1 ? "primary" : "secondary"}
                    href={cta.href}
                    external={cta.external}
                    onClick={() => trackHeroEvent(slide.id, "click", index)}
                  >
                    {cta.label}
                  </ButtonLink>
                ) : null,
              )}
            </div>
          </div>

          {/*
            Görsel mobilde de görünür; oran mobilde daha geniş (16/10) —
            4/3 dikey alanın yarısını yiyip başlığı katlanın altına itiyordu.
          */}
          <div
            className={`relative order-1 aspect-[16/10] w-full overflow-hidden rounded-lg bg-surface md:aspect-[4/3] ${
              imageRight ? "md:order-2" : "md:order-1"
            }`}
          >
            <HeroPicture
              imageUrl={slide.imageUrl}
              mobileImageUrl={slide.mobileImageUrl}
              alt={alt}
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 45vw, 560px"
              className="object-cover object-center"
              priority={isFirst}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
