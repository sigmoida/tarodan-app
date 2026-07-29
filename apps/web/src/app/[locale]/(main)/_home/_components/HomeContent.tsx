import { PageShell } from "@/components/layout/PageShell";
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
      <HeroSlider />
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
      <TrustBadges locale={locale} />
    </PageShell>
  );
}
