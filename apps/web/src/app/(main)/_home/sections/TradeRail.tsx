'use client';

import { useLocale, useTranslations } from "next-intl";
import { useHome } from '../context/HomeDataContext';
import HomeSection from './HomeSection';
import ProductRail from './ProductRail';

export default function TradeRail() {
	const locale = useLocale();
	const { trade, isLoadingTrade } = useHome();
	const viewAllLabel = locale === 'en' ? 'View All' : 'Tümünü gör';

	if (!(isLoadingTrade || trade.length > 0)) return null;

	return (
		<HomeSection
			title={locale === 'en' ? 'Trade Showcase' : 'Takas Vitrini'}
			viewAllHref='/takas'
			viewAllLabel={viewAllLabel}>
			<ProductRail items={trade} isLoading={isLoadingTrade} />
		</HomeSection>
	);
}
