/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const ISTANBUL = ['İstanbul', 'istanbul', 'ISTANBUL'];

/** Local fallback when the rates API has nothing (guests, or API failure). */
function localRate(city: string): number {
	return ISTANBUL.some((c) => city.toLowerCase().includes(c.toLowerCase()))
		? 34.9
		: 49.9;
}

/**
 * Shipping cost for the destination city. Replaces the manual `useEffect` +
 * `useState` calculation: authed users try the rates API first, everyone falls
 * back to a local estimate. Disabled until a city + at least one item exist.
 */
export function useShippingCost({
	isAuthenticated,
	city,
	carrier,
	itemCount,
}: {
	isAuthenticated: boolean;
	city: string;
	carrier: string;
	itemCount: number;
}) {
	const enabled = !!city && itemCount > 0;

	const query = useQuery({
		queryKey: ['checkout-shipping', city, carrier, isAuthenticated],
		queryFn: async (): Promise<number> => {
			if (isAuthenticated) {
				const response = await api
					.get('/shipping/rates', {
						params: { city, carrier, weight: 0.5 },
					})
					.catch(() => null);
				if (response?.data?.rate) return response.data.rate;
			}
			return localRate(city);
		},
		enabled,
	});

	return {
		shippingCost: enabled ? (query.data ?? 0) : 0,
		shippingLoading: enabled && query.isLoading,
	};
}
