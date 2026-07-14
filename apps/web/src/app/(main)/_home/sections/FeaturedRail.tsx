'use client';

import { useLocale, useTranslations } from "next-intl";
import { useHome } from '../context/HomeDataContext';
import HomeSection from './HomeSection';
import ProductRail from './ProductRail';

export default function FeaturedRail() {
	const locale = useLocale();
	const { featured, isLoadingFeatured } = useHome();

	if (!(isLoadingFeatured || featured.length > 0)) return null;

	return (
		<HomeSection title={locale === 'en' ? 'Featured' : 'Öne Çıkan Ürünler'}>
			<ProductRail items={featured} isLoading={isLoadingFeatured} />
		</HomeSection>
	);
}
