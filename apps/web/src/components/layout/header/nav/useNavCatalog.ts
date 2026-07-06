/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { categoriesApi, manufacturersApi, listingsApi } from '@/lib/api';
import type { ManufacturerRef } from './config';

interface Category {
	id: string;
	name: string;
	slug: string;
}

const HOUR = 60 * 60 * 1000;

/**
 * The catalog data behind the header nav — categories, manufacturers and scale
 * facets. All cached via TanStack Query (keys shared with the rest of the app,
 * so repeated mounts and other consumers dedupe to one request each) instead of
 * the previous per-mount `useEffect` fetches.
 */
export function useNavCatalog() {
	const categoriesQuery = useQuery({
		queryKey: queryKeys.categories.all(),
		queryFn: async (): Promise<Category[]> => {
			const res = await categoriesApi.findAll();
			const raw = res.data;
			return Array.isArray(raw) ? raw : (raw?.data ?? []);
		},
		staleTime: HOUR,
	});

	const manufacturersQuery = useQuery({
		queryKey: queryKeys.manufacturers.list(),
		queryFn: async (): Promise<ManufacturerRef[]> => {
			const res = await manufacturersApi.findAll();
			const raw = res.data;
			return Array.isArray(raw) ? raw : (raw?.data ?? []);
		},
		staleTime: HOUR,
	});

	// The full listings filter facets — cached under one key so the sidebar
	// filters (SidebarFilters) share the same fetch; here we only read `scales`.
	const filtersQuery = useQuery({
		queryKey: queryKeys.listings.filters(),
		queryFn: async () => (await listingsApi.getFilters()).data as { scales?: string[] },
		staleTime: HOUR,
	});

	return {
		categories: categoriesQuery.data ?? [],
		manufacturers: manufacturersQuery.data ?? [],
		scales: filtersQuery.data?.scales ?? [],
	};
}
