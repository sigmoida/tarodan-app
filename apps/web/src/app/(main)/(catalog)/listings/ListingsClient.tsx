/** @format */

'use client';

import { useTranslation } from '@/i18n';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Container } from '@/components/layout/Container';
import { ListingsProvider, useListings } from './_context/ListingsContext';
import ListingsControls, {
	ActiveFilterChips,
} from './_components/ListingsToolbar';
import ListingsSidebar from './_components/ListingsSidebar';
import ListingsGrid from './_components/ListingsGrid';
import ListingsPagination from './_components/ListingsPagination';

function ListingsLayout() {
	const { locale } = useTranslation();
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
			<PageHeader title={title} description={description} actions={<ListingsControls />} />

			<Container className='px-4 py-5'>
				<div className='flex gap-6'>
					{/* Sidebar Filters (Desktop + Mobile drawer) */}
					<ListingsSidebar />

					{/* Content */}
					<div className='flex-1 min-w-0'>
						<ActiveFilterChips />
						<ListingsGrid />
						<ListingsPagination />
					</div>
				</div>
			</Container>
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
