/** @format */

'use client';

import { PageShell } from '@/components/layout/PageShell';
import HeroSlider from '../sections/HeroSlider';
import TrustBadges from '../sections/TrustBadges';
import { HomeDataProvider } from '../context/HomeDataContext';
import BrandsMarquee from '../sections/BrandsMarquee';
import FeaturedRail from '../sections/FeaturedRail';
import OnSaleRail from '../sections/OnSaleRail';
import PopularRail from '../sections/PopularRail';
import Spotlights from '../sections/Spotlights';
import TopCollections from '../sections/TopCollections';
import TradeRail from '../sections/TradeRail';

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
				<TopCollections />
				<Spotlights />
				<TrustBadges />
			</PageShell>
		</HomeDataProvider>
	);
}
