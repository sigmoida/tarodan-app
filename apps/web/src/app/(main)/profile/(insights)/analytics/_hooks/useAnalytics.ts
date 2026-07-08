/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
	emptyAnalytics,
	normalizeAnalytics,
	type AnalyticsData,
	type AnalyticsPeriod,
} from '../_lib/types';

/** Performance analytics for a period. Keyed by period so switching refetches
 * (the dataset genuinely changes per period). */
export function useAnalytics(period: AnalyticsPeriod, enabled: boolean) {
	const query = useQuery({
		queryKey: ['profile-analytics', period],
		queryFn: async (): Promise<AnalyticsData> => {
			try {
				const res = await api.get('/users/me/analytics', { params: { period } });
				return normalizeAnalytics(res.data);
			} catch {
				return emptyAnalytics(period);
			}
		},
		enabled,
		meta: { page: 'profile-analytics' },
	});
	return { analytics: query.data ?? null, isLoading: query.isLoading };
}
