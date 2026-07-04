/** @format */

'use client';

import { PageShell } from '@/components/layout/PageShell';
import HeroSlider from '@/components/home/HeroSlider';
import TrustBadges from '@/components/home/TrustBadges';
import { HomeDataProvider } from './_home/context/HomeDataContext';
import BrandsMarquee from './_home/sections/BrandsMarquee';
import FeaturedRail from './_home/sections/FeaturedRail';
import HomeAuthModal from './_home/sections/HomeAuthModal';
import OnSaleRail from './_home/sections/OnSaleRail';
import PopularRail from './_home/sections/PopularRail';
import Spotlights from './_home/sections/Spotlights';
import TopCollectionsCarousel from './_home/sections/TopCollectionsCarousel';
import TradeRail from './_home/sections/TradeRail';

export default function HomeClient() {
	return (
		<HomeDataProvider>
			<PageShell>
				<HeroSlider />
				<BrandsMarquee />
				<FeaturedRail />
				<OnSaleRail />
				<TradeRail />
				<PopularRail />
				<TopCollectionsCarousel />
				<Spotlights />
				<TrustBadges />
				<HomeAuthModal />
			</PageShell>
		</HomeDataProvider>
	);
}
