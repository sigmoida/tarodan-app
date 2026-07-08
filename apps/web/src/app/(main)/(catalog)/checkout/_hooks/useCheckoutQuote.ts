/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import type { CheckoutQuote } from '../_lib/types';

/**
 * Server pricing quote (subtotal + shipping + platform fee + tax) for the current
 * items. Replaces the manual `useEffect` fetch; the key includes the ordered
 * product ids so it refetches when the cart changes.
 */
export function useCheckoutQuote(productIds: string[]) {
	const key = productIds.join(',');
	const query = useQuery({
		queryKey: ['checkout-quote', key],
		queryFn: async (): Promise<CheckoutQuote | null> => {
			const res = await ordersApi.getQuote({
				items: productIds.map((productId) => ({ productId, quantity: 1 })),
			});
			if (res.data?.pricing) return { pricing: res.data.pricing };
			return (res.data ?? null) as CheckoutQuote | null;
		},
		enabled: productIds.length > 0,
	});

	return {
		quote: query.data ?? null,
		quoteLoading: query.isLoading && productIds.length > 0,
		quoteError: query.isError,
	};
}
