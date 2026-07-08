/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { addressesApi } from '@/lib/api';
import type { Address } from '../_lib/types';

/**
 * The signed-in user's saved addresses. Replaces the manual `fetchAddresses`
 * read; default-selection and "show the form when empty" side effects live in the
 * context, and writes invalidate `['checkout-addresses']`.
 */
export function useCheckoutAddresses(isAuthenticated: boolean) {
	const query = useQuery({
		queryKey: ['checkout-addresses'],
		queryFn: async (): Promise<Address[]> => {
			const response = await addressesApi.getAll();
			const list =
				response.data?.addresses ||
				response.data?.data ||
				response.data ||
				[];
			return Array.isArray(list) ? list : [];
		},
		enabled: isAuthenticated,
	});

	return {
		addresses: query.data ?? [],
		addressesLoading: query.isLoading && isAuthenticated,
		addressesError: query.isError,
	};
}
