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

	const scalesQuery = useQuery({
		queryKey: queryKeys.listings.filters(),
		queryFn: async (): Promise<string[]> => {
			const res = await listingsApi.getFilters();
			const data = res.data as { scales?: string[] };
			return data.scales ?? [];
		},
		staleTime: HOUR,
	});

	return {
		categories: categoriesQuery.data ?? [],
		manufacturers: manufacturersQuery.data ?? [],
		scales: scalesQuery.data ?? [],
	};
}
