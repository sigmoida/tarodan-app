/** @format */

'use client';

import { useTranslation } from '@/i18n';
import { ListingsProvider, useListings } from './_context/ListingsContext';
import ListingsToolbar, {
	ActiveFilterChips,
} from './_components/ListingsToolbar';
import ListingsSidebar from './_components/ListingsSidebar';
import ListingsGrid from './_components/ListingsGrid';
import ListingsPagination from './_components/ListingsPagination';

function ListingsLayout() {
	const { t, locale } = useTranslation();
	const { currentSearch, filters } = useListings();

	return (
		<div className='min-h-screen'>
			{/* Page Header */}
			<ListingsToolbar />

			<div className='mx-auto p-4'>
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
			</div>
		</div>
	);
}

export default function ListingsClient() {
	return (
		<ListingsProvider>
			<ListingsLayout />
		</ListingsProvider>
	);
}
