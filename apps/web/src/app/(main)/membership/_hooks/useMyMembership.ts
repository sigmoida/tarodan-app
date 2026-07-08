/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import type { MembershipDetails } from '../_lib/types';

/**
 * The current user's membership (`/membership/me`) — the fresh source of truth
 * for tier/status/period, preferred over the (possibly stale) authStore tier.
 * Only fetched when authenticated (the logged-out branch never calls it).
 */
export function useMyMembership(enabled: boolean) {
	const query = useQuery({
		queryKey: queryKeys.membership.me(),
		queryFn: async (): Promise<MembershipDetails | null> => {
			const res = await api.get('/membership/me');
			const m = res.data;
			if (!m) return null;
			return {
				currentPeriodStart: m.currentPeriodStart,
				currentPeriodEnd: m.currentPeriodEnd,
				tier: m.tier?.type,
				status: m.status,
				cancelledAt: m.cancelledAt,
				pendingPayment: m.pendingPayment ? true : undefined,
				pendingTierName: m.pendingTierName,
				pendingTierType: m.pendingTierType,
				scheduledTierType: m.scheduledTierType,
				scheduledBillingPeriod: m.scheduledBillingPeriod,
				autoRenew: m.autoRenew,
			};
		},
		enabled,
	});
	return { membership: query.data ?? null, isLoading: query.isLoading };
}
