/** @format */

import Image from "next/image";
import { useTranslations } from "next-intl";
import { DevicePhoneMobileIcon } from "@heroicons/react/24/outline";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { APP_STORE_LINKS } from "@/lib/appStoreLinks";
import {
  HERO_ACTIONS_CLASS,
  HERO_SUBTITLE_CLASS,
  HERO_TITLE_CLASS,
  HeroSlideLayout,
} from "./HeroSlideLayout";

/**
 * Mobil uygulama tanıtımı — ana sayfa hero'sunun kodda tanımlı, sabit İLK
 * slaytı (admin slaytlarından önce). `NEXT_PUBLIC_APP_PROMO_ENABLED` ile açılır;
 * admin web hero'sunu kapatınca bu da gizlenir (bkz. `HomeContent`). Sayfanın
 * tek `<h1>`'i budur. İskelet admin slaytlarıyla ortak (`HeroSlideLayout`).
 */
export default function AppPromoSlide() {
  const t = useTranslations("home.appPromo");

  return (
    <HeroSlideLayout
      imageSide="right"
      className="bg-gradient-to-br from-primary-50 via-surface-alt to-primary-100"
      media={
        <Image
          src="/app-promo-phones.webp"
          alt={t("imageAlt")}
          fill
          priority
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 45vw, 560px"
          className="object-contain object-center"
        />
      }
    >
      <p className="mb-3 text-xs font-bold tracking-widest text-primary-700 md:mb-4">
        {t("eyebrow")}
      </p>
      <h1 className={HERO_TITLE_CLASS}>
        {t.rich("title", {
          accent: (chunks) => (
            <span className="text-primary-600">{chunks}</span>
          ),
        })}
      </h1>
      <p className={HERO_SUBTITLE_CLASS}>{t("description")}</p>
      <div className={HERO_ACTIONS_CLASS}>
        {APP_STORE_LINKS.map((store) => (
          <ButtonLink
            key={store.id}
            href={store.href}
            external
            variant="dark"
            size="lg"
            className="h-auto min-h-12 w-full gap-3 py-2 sm:w-auto sm:justify-start"
          >
            <DevicePhoneMobileIcon
              aria-hidden="true"
              className="h-6 w-6 shrink-0 text-primary-500"
            />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-xs font-medium text-inverted/80">
                {t("openOnMobile")}
              </span>
              <span className="text-base font-bold">{store.storeName}</span>
              <span className="sr-only">{t("opensInNewTab")}</span>
            </span>
          </ButtonLink>
        ))}
      </div>
    </HeroSlideLayout>
  );
}
