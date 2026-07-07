/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BusinessStats } from '../_lib/types';

/**
 * Business/seller analytics for the current account (`/users/me/business-stats`).
 * A 400 surfaces the backend's reason (falling back to the "İşletme hesabı"
 * hint); any other failure becomes a generic load error. Replaces the page's
 * manual fetch loop.
 */
export function useBusinessStats(enabled: boolean) {
	const query = useQuery({
		queryKey: ['business-stats'],
		queryFn: async (): Promise<BusinessStats> => {
			try {
				const res = await api.get('/users/me/business-stats');
				return res.data as BusinessStats;
			} catch (err: any) {
				if (err.response?.status === 400) {
					throw new Error(
						err.response?.data?.message ||
							err.response?.data?.error ||
							'Bu özellik sadece İşletme hesapları için geçerlidir.',
					);
				}
				throw new Error('İstatistikler yüklenirken bir hata oluştu');
			}
		},
		enabled,
		retry: false,
		meta: { page: 'business-stats' },
	});

	return {
		stats: query.data ?? null,
		isLoading: query.isLoading,
		error: query.error instanceof Error ? query.error.message : null,
	};
}
