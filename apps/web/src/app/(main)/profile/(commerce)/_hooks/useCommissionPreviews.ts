/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';

export interface EstimatedNet {
	sellerFeeAmount: number;
	sellerNetAmount: number;
}

export interface CommissionItem {
	id: string;
	amount: number;
	categoryId?: string | null;
}

/**
 * Batch seller-net estimation, keyed by item id. Shared by every surface that
 * previews commission (my-listings, received offers, …) so the batch call +
 * signature-based caching live in one place.
 */
export function useCommissionPreviews(
	items: CommissionItem[],
): Record<string, EstimatedNet> {
	const signature = items
		.map((i) => `${i.id}-${i.amount}-${i.categoryId ?? ''}`)
		.join(',');

	const query = useQuery({
		queryKey: ['commission-previews', signature],
		enabled: items.length > 0,
		queryFn: async (): Promise<Record<string, EstimatedNet>> => {
			const res = await ordersApi.getCommissionPreviewBatch(
				items.map((i) => ({ amount: Number(i.amount), categoryId: i.categoryId ?? null })),
			);
			const map: Record<string, EstimatedNet> = {};
			if (Array.isArray(res.data?.results)) {
				items.forEach((it, i) => {
					const r = res.data.results[i];
					if (r != null && typeof r.sellerNetAmount === 'number') map[it.id] = r;
				});
			}
			return map;
		},
		meta: { page: 'commission-previews' },
	});

	return query.data ?? {};
}
