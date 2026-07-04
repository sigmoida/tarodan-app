'use client';

import { useTranslation } from '@/i18n/LanguageContext';
import { useHome } from '../context/HomeDataContext';
import HomeSection from './HomeSection';
import ProductRail from './ProductRail';

export default function TradeRail() {
	const { locale } = useTranslation();
	const { trade, isLoadingTrade } = useHome();
	const viewAllLabel = locale === 'en' ? 'View All' : 'Tümünü gör';

	if (!(isLoadingTrade || trade.length > 0)) return null;

	return (
		<HomeSection
			title={locale === 'en' ? 'Trade Showcase' : 'Takas Vitrini'}
			viewAllHref='/takas'
			viewAllLabel={viewAllLabel}>
			<ProductRail
				items={trade}
				isLoading={isLoadingTrade}
				variant='grid'
				gridClassName='grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8'
				skeletonCount={6}
				limit={12}
			/>
		</HomeSection>
	);
}
