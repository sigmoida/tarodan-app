/** @format */

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/api';
import type { UserProduct } from '../_lib/types';

const PAGE_SIZE = 100;

/**
 * The current user's listings, minus the ones already in the collection — the
 * source for the "add from my listings" tab. Replaces the manual paginated
 * `fetchMyProducts` + `useState`. `products/my` caps a page at 100, so we walk
 * pages until a short page (users with >100 listings used to miss items).
 */
export function useMyProducts(enabled: boolean, existingProductIds: Set<string>) {
	const query = useQuery({
		queryKey: ['my-products-all'],
		queryFn: async (): Promise<UserProduct[]> => {
			const all: UserProduct[] = [];
			for (let page = 1; page <= 50; page++) {
				const response = await userApi.getMyProducts({ page, limit: PAGE_SIZE });
				const products: UserProduct[] =
					response.data.data || response.data.products || [];
				all.push(...products);
				if (products.length < PAGE_SIZE) break;
			}
			return all;
		},
		enabled,
		staleTime: 60 * 1000,
	});

	const products = useMemo(
		() => (query.data ?? []).filter((p) => !existingProductIds.has(p.id)),
		[query.data, existingProductIds],
	);

	return {
		products,
		isLoading: query.isLoading,
		isError: query.isError,
		refetch: query.refetch,
	};
}
