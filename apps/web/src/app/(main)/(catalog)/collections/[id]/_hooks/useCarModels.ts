/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface CarModel {
	id: string;
	name: string;
	slug: string;
}

/**
 * Car models for the selected brand slug. Replaces the old `useEffect` that
 * fired on every `customBrand` change; the query is disabled until a slug is set.
 */
export function useCarModels(brandSlug: string | undefined) {
	const query = useQuery({
		queryKey: ['car-models', brandSlug],
		queryFn: async (): Promise<CarModel[]> => {
			const res = await api.get(`/car-models?brand=${brandSlug}`);
			return Array.isArray(res.data) ? res.data : res.data?.data || [];
		},
		enabled: !!brandSlug,
		staleTime: 5 * 60 * 1000,
	});

	return {
		models: query.data ?? [],
		isLoading: query.isLoading && !!brandSlug,
	};
}
