'use client';

import { ButtonLink, EmptyState, ProductBadge } from '@/components/ui';
import { useLocale, useTranslations } from "next-intl";
import { useHome } from '../context/HomeDataContext';
import HomeSection from './HomeSection';
import ProductRail from './ProductRail';

export default function OnSaleRail() {
	const locale = useLocale();
	const { discounted, isLoadingDiscounted } = useHome();
	const viewAllLabel = locale === 'en' ? 'View All' : 'Tümünü gör';

	return (
		<HomeSection
			title={locale === 'en' ? 'On Sale' : 'İndirimdekiler'}
			viewAllHref='/listings?discountOnly=true'
			viewAllLabel={viewAllLabel}
			badge={
				<ProductBadge variant='sale'>
					{locale === 'en' ? 'Deals' : 'Fırsat'}
				</ProductBadge>
			}>
			<ProductRail
				items={discounted}
				isLoading={isLoadingDiscounted}
				emptyState={
					<EmptyState
						title={locale === 'en' ? 'No products on sale' : 'İndirimde ürün yok'}
						description={
							locale === 'en' ? 'Check back later!' : 'Daha sonra tekrar bakın!'
						}
						action={
							<ButtonLink variant='secondary' size='sm' href='/listings'>
								{viewAllLabel}
							</ButtonLink>
						}
					/>
				}
			/>
		</HomeSection>
	);
}
