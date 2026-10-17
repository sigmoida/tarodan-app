/** @format */

import Image from "next/image";
import { useTranslations } from "next-intl";
import { DevicePhoneMobileIcon } from "@heroicons/react/24/outline";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { APP_STORE_LINKS } from "@/lib/appStoreLinks";

/** Kırpılmış görselin gerçek boyutu — oran yer ayırır, kayma olmaz. */
const IMAGE = { src: "/app-promo-phones.webp", width: 780, height: 687 };

/**
 * Mobil uygulama tanıtımı — ana sayfa hero'sunun kodda tanımlı, sabit İLK
 * slaytı (admin slaytlarından önce). Admin web hero'sunu kapatınca bu da
 * gizlenir (bkz. `HomeContent`). Sayfanın tek `<h1>`'i budur.
 *
 * Telefonda metin önce, görsel altta; `md`'den itibaren iki sütun.
 */
export default function AppPromoSlide() {
  const t = useTranslations("home.appPromo");

  return (
    <div className="w-full flex-shrink-0 bg-gradient-to-br from-primary-50 via-surface-alt to-primary-100">
      <div className="px-5 py-8 sm:px-8 md:px-10 md:py-14 lg:px-14 lg:py-16">
        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          <div>
            <p className="mb-3 text-xs font-bold tracking-widest text-primary-600 md:mb-4">
              {t("eyebrow")}
            </p>
            <h1 className="mb-4 font-display text-3xl font-bold leading-[1.1] tracking-tight text-heading md:mb-6 md:text-4xl lg:text-[3.25rem]">
              {t.rich("title", {
                accent: (chunks) => (
                  <span className="text-primary-600">{chunks}</span>
                ),
              })}
            </h1>
            <p className="mb-6 max-w-lg text-base leading-relaxed text-muted md:text-lg">
              {t("description")}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {APP_STORE_LINKS.map((store) => (
                <ButtonLink
                  key={store.id}
                  href={store.href}
                  external
                  size="lg"
                  aria-label={t("storeLinkLabel", { store: store.storeName })}
                  className="h-auto min-h-12 w-full gap-3 bg-heading py-2 text-inverted hover:bg-heading/90 focus-visible:ring-heading sm:w-auto sm:justify-start"
                >
                  <DevicePhoneMobileIcon
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 text-primary-500"
                  />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-xs font-medium text-inverted/80">
                      {t("openOnMobile")}
                    </span>
                    <span className="text-base font-bold">
                      {store.storeName}
                    </span>
                  </span>
                </ButtonLink>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm md:max-w-none">
            <Image
              src={IMAGE.src}
              width={IMAGE.width}
              height={IMAGE.height}
              alt={t("imageAlt")}
              priority
              sizes="(max-width: 768px) 384px, (max-width: 1024px) 45vw, 560px"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
