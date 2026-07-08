/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import {
	aggregateStats,
	emptyStats,
	mapRecentSales,
	type RecentSale,
	type UserStats,
} from '../_lib/types';

/**
 * Account statistics: prefers the `/users/me/stats` aggregate, falling back to
 * a 5-endpoint client-side aggregation. Replaces the page's manual fetch loop.
 */
export function useStatistics(enabled: boolean) {
	const user = useAuthStore((s) => s.user);
	const query = useQuery({
		queryKey: ['profile-statistics'],
		queryFn: async (): Promise<UserStats> => {
			try {
				const direct = await api.get('/users/me/stats').catch(() => null);
				if (direct?.data) return direct.data as UserStats;

				const [productsRes, ordersRes, tradesRes, collectionsRes, profileRes] =
					await Promise.all([
						api.get('/products/my').catch(() => ({ data: { data: [] } })),
						api
							.get('/orders', { params: { role: 'buyer', limit: 100 } })
							.catch(() => ({ data: { data: [] } })),
						api.get('/trades').catch(() => ({ data: { data: [] } })),
						api.get('/collections/me').catch(() => ({ data: { data: [] } })),
						api.get('/users/me').catch(() => ({ data: {} })),
					]);

				return aggregateStats(
					productsRes.data.data || productsRes.data.products || [],
					ordersRes.data.data || ordersRes.data.orders || [],
					tradesRes.data.data || tradesRes.data.trades || [],
					collectionsRes.data.data || collectionsRes.data.collections || [],
					profileRes.data,
					user,
				);
			} catch {
				return emptyStats(user);
			}
		},
		enabled,
		meta: { page: 'profile-statistics' },
	});
	return { stats: query.data ?? null, isLoading: query.isLoading };
}

/** The seller's 10 most recent sales. */
export function useRecentSales(enabled: boolean) {
	const userId = useAuthStore((s) => s.user?.id);
	const query = useQuery({
		queryKey: ['profile-recent-sales'],
		queryFn: async (): Promise<RecentSale[]> => {
			const res = await api
				.get('/orders', { params: { role: 'seller', limit: 10 } })
				.catch(() => null);
			const orders = res?.data?.data || res?.data?.orders || [];
			return mapRecentSales(orders, userId);
		},
		enabled,
		meta: { page: 'profile-recent-sales' },
	});
	return query.data ?? [];
}
