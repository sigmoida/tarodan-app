import { PageShell } from "@/components/layout/PageShell";
import { HOME_RAILS } from "../lib/rails";
import type { HomePageData } from "../lib/types";
import BrandsMarquee from "../sections/BrandsMarquee";
import FeaturedRail from "../sections/FeaturedRail";
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

export default function HomeContent({
  data,
  locale,
}: {
  data: HomePageData;
  locale: string;
}) {
  const featuredCollector =
    data.featuredCollector ?? data.topCollections[0] ?? null;
  // Only server-seeded cards can anchor the tour step; a rail loading
  // client-side (`null` seed) does not count.
  const hasProducts = HOME_RAILS.some((rail) => (data[rail]?.length ?? 0) > 0);

  return (
    <PageShell>
      <HomeOnboardingTour hasProducts={hasProducts} />
      {/* Reklam popup'ı YALNIZ ana sayfada: her girişte yeniden değerlendirilir
          (sıklık reklamın kendisinde), tüm katmanlar kapalıyken. */}
      <PopupAd />
      {/* Admin'in tanımladığı afiş ve platform kampanya duyurusu — hero'nun
          ÜSTÜNDE. Yuva boşsa hiçbir şey çizilmez (yer ayrılmaz). */}
      <BannerSlot position="header" className="mb-4 space-y-3" />
      {/* Panelden yönetilen hero; web hero anahtarı kapalıyken API `[]` döner
          ve bölüm çizilmez. Uygulama tanıtımı da bir admin slaytıdır (mağaza
          bağlantılı CTA'lar koyu mağaza butonu olarak çizilir). */}
      <HeroSlider slides={data.heroSlides} />
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
