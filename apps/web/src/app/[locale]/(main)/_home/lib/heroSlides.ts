/** @format */

import type { MessageKey } from "@tarodan/i18n";
import { heroImageUrl } from "@/lib/assetCdn";

export interface HeroSlide {
  /** Catalog key. Value supports `\n` for a manual line break (rendered via
   *  `whitespace-pre-line`). */
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  cta1: { labelKey: MessageKey; href: string };
  cta2: { labelKey: MessageKey; href: string };
  image: string;
  /** true → image on the right, text on the left; false → the reverse. */
  imageRight: boolean;
}

/** Hero slides for the storefront landing slider. Labels resolve from the
 *  shared catalog via `t()` — the slider is otherwise locale-agnostic. */
export const HERO_SLIDES: HeroSlide[] = [
  {
    titleKey: "home.slider.marketplaceTitle",
    subtitleKey: "home.slider.marketplaceSubtitle",
    cta1: { labelKey: "collection.exploreCollections", href: "/collections" },
    cta2: { labelKey: "home.slider.browseMarketplace", href: "/listings" },
    image: heroImageUrl("hero-marketplace.png"),
    imageRight: true,
  },
  {
    titleKey: "home.slider.hotWheelsTitle",
    subtitleKey: "home.slider.hotWheelsSubtitle",
    // Belirli bir üreticiye (Hot Wheels) filtreli bağlantı, o üretici katalogda
    // yokken ziyaretçiyi boş listeye düşürüyordu. Slayt görseli markayı zaten
    // anlatıyor; bağlantı tüm ilanlara gider.
    cta1: {
      labelKey: "home.slider.exploreHotWheels",
      href: "/listings",
    },
    cta2: { labelKey: "home.slider.allBrands", href: "/listings" },
    image: heroImageUrl("hero-hot-wheels.png"),
    imageRight: false,
  },
  {
    titleKey: "home.slider.secureTradingTitle",
    subtitleKey: "home.slider.secureTradingSubtitle",
    cta1: { labelKey: "home.slider.startTrading", href: "/profile/trades" },
    cta2: { labelKey: "home.slider.howItWorks", href: "/secure-swap" },
    image: heroImageUrl("hero-trading.png"),
    imageRight: true,
  },
];
