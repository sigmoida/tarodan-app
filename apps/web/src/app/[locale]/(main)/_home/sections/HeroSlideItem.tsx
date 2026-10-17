/** @format */

"use client";

import { useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DevicePhoneMobileIcon } from "@heroicons/react/24/outline";
import { pickLocalized, type HeroSlideDto } from "@tarodan/types";
import { ButtonLink } from "@/components/ui/ButtonLink";
import HeroPicture from "@/components/marketing/HeroPicture";
import { useVisibilityImpression } from "@/hooks/useVisibilityImpression";
import { trackHeroEvent, type HeroCtaIndex } from "@/lib/api/heroTracking";
import { resolveHeroCta, type ResolvedHeroCta } from "@/lib/heroView";
import {
  HERO_ACTIONS_CLASS,
  HERO_SUBTITLE_CLASS,
  HERO_TITLE_CLASS,
  HeroSlideLayout,
} from "./HeroSlideLayout";

/**
 * Mağaza bağlantılı CTA (App Store / Google Play): koyu mağaza butonu — telefon
 * simgesi, küçük "Mobilde aç" başlığı ve admin'in yazdığı etiket; yeni sekmede
 * açılır (`ButtonLink external` → `rel="noopener noreferrer"`).
 */
function StoreCtaContent({ label }: { label: string }) {
  const t = useTranslations("home.slider");
  return (
    <>
      <DevicePhoneMobileIcon
        aria-hidden="true"
        className="h-6 w-6 shrink-0 text-primary-500"
      />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-xs font-medium text-inverted/80">
          {t("openOnMobile")}
        </span>
        <span className="text-base font-bold">{label}</span>
        <span className="sr-only">{t("opensInNewTab")}</span>
      </span>
    </>
  );
}

/** Mağaza CTA'sının buton görünümü (normal CTA'lar varsayılan boyutta kalır). */
const STORE_CTA_CLASS =
  "h-auto min-h-12 w-full gap-3 py-2 sm:w-auto sm:justify-start";

function ctaVariant(cta: ResolvedHeroCta, index: HeroCtaIndex) {
  if (cta.store) return "dark" as const;
  return index === 1 ? ("primary" as const) : ("secondary" as const);
}

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
              variant={ctaVariant(cta, index)}
              href={cta.href}
              external={cta.external}
              size={cta.store ? "lg" : undefined}
              className={cta.store ? STORE_CTA_CLASS : undefined}
              onClick={() => trackHeroEvent(slide.id, "click", index)}
            >
              {cta.store ? <StoreCtaContent label={cta.label} /> : cta.label}
            </ButtonLink>
          ) : null,
        )}
      </div>
    </HeroSlideLayout>
  );
}
