/** @format */

'use client';

import { useLocale, useTranslations } from "next-intl";
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { ListingsProvider, useListings } from './_context/ListingsContext';
import ListingsControls, {
	ActiveFilterChips,
} from './_components/ListingsToolbar';
import ListingsSidebar from './_components/ListingsSidebar';
import ListingsGrid from './_components/ListingsGrid';
import ListingsPagination from './_components/ListingsPagination';

function ListingsLayout() {
	const locale = useLocale();
	const { filters, currentSearch, pagination } = useListings();

	const title = currentSearch
		? locale === 'en'
			? `Results for "${currentSearch}"`
			: `"${currentSearch}" araması`
		: filters.brand ||
			filters.category ||
			(locale === 'en' ? 'All Listings' : 'Tüm İlanlar');
	const description = `${pagination.total} ${locale === 'en' ? 'products found' : 'ürün bulundu'}`;

	return (
		<PageShell>
			<PageHeader
				title={title}
				description={description}
				actions={<ListingsControls />}
			/>

			<div className='flex gap-4'>
				{/* Sidebar Filters (Desktop + Mobile drawer) */}
				<ListingsSidebar />

				{/* Content */}
				<div className='flex-1 min-w-0 space-y-4'>
					<ActiveFilterChips />
					<ListingsGrid />
					<ListingsPagination />
				</div>
			</div>
		</PageShell>
	);
}

export default function ListingsClient() {
	return (
		<ListingsProvider>
			<ListingsLayout />
		</ListingsProvider>
	);
}
