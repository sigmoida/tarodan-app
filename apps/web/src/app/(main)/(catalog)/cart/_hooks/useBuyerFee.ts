/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';

type QuoteItem = { productId?: string; id?: string; quantity?: number };

/**
 * The platform service fee (buyer commission) for the current online cart,
 * quoted from the backend so the cart shows the same net total the checkout
 * will. Keyed by the cart line signature so it refetches when items change; the
 * empty cart is disabled (fee = 0). Guest (offline) items aren't quoted — the
 * fee is resolved after login.
 */
export function useBuyerFee(items: QuoteItem[] | undefined): number {
	const list = items ?? [];
	const signature = list
		.map((it) => `${it.productId ?? it.id}:${it.quantity ?? 1}`)
		.join(',');

	const { data } = useQuery({
		queryKey: ['cart', 'buyer-fee', signature],
		queryFn: async () => {
			const res: any = await ordersApi.getQuote({
				items: list.map((it) => ({
					productId: it.productId ?? it.id!,
					quantity: it.quantity ?? 1,
				})),
			});
			return Number(
				res.data?.pricing?.buyerFeeAmount ?? res.data?.buyerFeeAmount ?? 0,
			);
		},
		enabled: list.length > 0,
	});

	return data ?? 0;
}
