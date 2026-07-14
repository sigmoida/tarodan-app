'use client';

import { ButtonLink, EmptyState } from '@/components/ui';
import { useLocale, useTranslations } from "next-intl";
import { useHome } from '../context/HomeDataContext';
import HomeSection from './HomeSection';
import ProductRail from './ProductRail';

export default function PopularRail() {
	const locale = useLocale();
	const { bestSellers, isLoadingBestSellers } = useHome();
	const viewAllLabel = locale === 'en' ? 'View All' : 'Tümünü gör';

	return (
		<HomeSection
			title={locale === 'en' ? 'Popular Listings' : 'Popüler İlanlar'}
			viewAllHref='/listings?sortBy=view_count_desc'
			viewAllLabel={viewAllLabel}>
			<ProductRail
				items={bestSellers}
				isLoading={isLoadingBestSellers}
				emptyState={
					<EmptyState
						title={locale === 'en' ? 'No listings yet' : 'Henüz ilan yok'}
						description={locale === 'en' ? 'Be the first!' : 'İlk ilanı siz verin!'}
						action={
							<ButtonLink variant='secondary' size='sm' href='/listings/new'>
								{locale === 'en' ? 'Create Listing' : 'İlan Oluştur'}
							</ButtonLink>
						}
					/>
				}
			/>
		</HomeSection>
	);
}
