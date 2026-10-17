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
import {
  HERO_ACTIONS_CLASS,
  HERO_SUBTITLE_CLASS,
  HERO_TITLE_CLASS,
  HeroSlideLayout,
} from "./HeroSlideLayout";

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
  const Heading = isFirst ? "h1" : "h2";

  const ctas = [
    { index: 1 as HeroCtaIndex, cta: resolveHeroCta(slide.cta1, locale) },
    { index: 2 as HeroCtaIndex, cta: resolveHeroCta(slide.cta2, locale) },
  ];

  return (
    <HeroSlideLayout
      ref={ref}
      imageSide={slide.imageSide}
      mediaClassName="bg-surface"
      media={
        <HeroPicture
          imageUrl={slide.imageUrl}
          mobileImageUrl={slide.mobileImageUrl}
          alt={alt}
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 45vw, 560px"
          className="object-cover object-center"
          priority={isFirst}
        />
      }
    >
      <Heading className={HERO_TITLE_CLASS}>{title}</Heading>
      {subtitle && <p className={HERO_SUBTITLE_CLASS}>{subtitle}</p>}
      <div className={HERO_ACTIONS_CLASS}>
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
    </HeroSlideLayout>
  );
}
