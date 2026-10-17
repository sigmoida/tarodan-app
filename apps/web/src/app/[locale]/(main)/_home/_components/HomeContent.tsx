import { PageShell } from "@/components/layout/PageShell";
import type { HomePageData } from "../lib/types";
import BrandsMarquee from "../sections/BrandsMarquee";
import FeaturedRail from "../sections/FeaturedRail";
import AppPromoSlide from "../sections/AppPromoSlide";
import HeroSlider from "../sections/HeroSlider";
import OnSaleRail from "../sections/OnSaleRail";
import PopularRail from "../sections/PopularRail";
import Spotlights from "../sections/Spotlights";
import TopCollections from "../sections/TopCollections";
import TradeRail from "../sections/TradeRail";
import TrustBadges from "../sections/TrustBadges";
import HomeOnboardingTour from "./HomeOnboardingTour";
import BannerSlot from "@/components/marketing/BannerSlot";
import PopupAd from "@/components/marketing/PopupAd";
import { APP_PROMO_ENABLED } from "@/lib/appStoreLinks";

export default function HomeContent({
  data,
  locale,
}: {
  data: HomePageData;
  locale: string;
}) {
  const featuredCollector =
    data.featuredCollector ?? data.topCollections[0] ?? null;
  const hasProducts =
    data.featured.length +
      data.discounted.length +
      data.trade.length +
      data.popular.length >
    0;

  return (
    <PageShell>
      <HomeOnboardingTour hasProducts={hasProducts} />
      {/* Reklam popup'ı YALNIZ ana sayfada: her girişte yeniden değerlendirilir
          (sıklık reklamın kendisinde), tüm katmanlar kapalıyken. */}
      <PopupAd />
      {/* Admin'in tanımladığı afiş ve platform kampanya duyurusu — hero'nun
          ÜSTÜNDE. Yuva boşsa hiçbir şey çizilmez (yer ayrılmaz). */}
      <BannerSlot position="header" className="mb-4 space-y-3" />
      {/* Mobil uygulama tanıtımı (env bayrağıyla) admin slaytlarından önce sabit
          ilk slayt. Web hero anahtarı kapalıyken API `[]` döner ve ikisi
          birlikte gizlenir. */}
      <HeroSlider
        slides={data.heroSlides}
        pinned={APP_PROMO_ENABLED ? <AppPromoSlide /> : undefined}
      />
      <BrandsMarquee items={data.marqueeItems} />
      <FeaturedRail items={data.featured} />
      <OnSaleRail items={data.discounted} />
      <TradeRail items={data.trade} />
      <PopularRail items={data.popular} />
      <TopCollections items={data.topCollections} />
      <Spotlights
        featuredCollector={featuredCollector}
        featuredBusiness={data.featuredBusiness}
      />
      <BannerSlot position="footer" className="mt-8 space-y-3" />
      <TrustBadges badges={data.trustBadges} locale={locale} />
    </PageShell>
  );
}
