/** @format */

import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getServerQueryClient } from '@/lib/query/server';
import { queryKeys } from '@/lib/query/keys';
import { fetchManufacturersServer } from './_lib/data';
import ManufacturersClient from './ManufacturersClient';

export const metadata: Metadata = {
	title: 'Üreticiler | Tarodan',
	description:
		"Dünyanın en prestijli diecast model araba üreticilerini keşfedin. Her markanın tarihini, özel serilerini ve popüler modellerini Tarodan'da inceleyin.",
	openGraph: {
		title: 'Diecast Üreticiler Rehberi | Tarodan',
		description:
			'Hot Wheels, Matchbox, AUTOart, Minichamps ve daha fazlası — diecast üreticilerini keşfedin.',
		type: 'website',
		url: '/manufacturers',
	},
};

export default async function ManufacturersPage() {
	// Seed the manufacturers list server-side so the guide ships in the first HTML
	// (crawlable) and the client's useQuery hydrates without a refetch flash.
	const queryClient = getServerQueryClient();
	const manufacturers = await fetchManufacturersServer();
	queryClient.setQueryData(queryKeys.manufacturers.list(), manufacturers);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ManufacturersClient />
		</HydrationBoundary>
	);
}
