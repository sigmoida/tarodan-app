/** @format */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { paymentsApi } from '@/lib/api';
import { useTranslation } from '@/i18n';
import {
	EMPTY_FILTERS,
	type PaymentFilterState,
	type PaymentListResponse,
} from '../_lib/types';

/** Paged + filtered payment history. Filters live here so the page stays thin. */
export function usePayments(enabled: boolean) {
	const [page, setPage] = useState(1);
	const [filters, setFilters] = useState<PaymentFilterState>(EMPTY_FILTERS);

	const query = useQuery({
		queryKey: ['profile-payments', page, filters],
		queryFn: async (): Promise<PaymentListResponse> => {
			const params: Record<string, string | number> = { page, limit: 20 };
			if (filters.status) params.status = filters.status;
			if (filters.provider) params.provider = filters.provider;
			if (filters.startDate) params.startDate = filters.startDate;
			if (filters.endDate) params.endDate = filters.endDate;
			const res = await paymentsApi.getMyPayments(params);
			return res.data;
		},
		enabled,
		// Keep the current page visible while the next loads — no spinner flash on
		// pagination / filter changes.
		placeholderData: keepPreviousData,
		meta: { page: 'profile-payments' },
	});

	/** Filter changes reset to the first page. */
	const setFilter = (key: keyof PaymentFilterState, value: string) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
		setPage(1);
	};
	const clearFilters = () => {
		setFilters(EMPTY_FILTERS);
		setPage(1);
	};

	return {
		payments: query.data?.payments ?? [],
		pagination: query.data?.pagination,
		isLoading: query.isLoading,
		page,
		setPage,
		filters,
		setFilter,
		clearFilters,
	};
}

export type PaymentActionType = 'cancel' | 'retry';

/** Cancel a pending payment / retry a failed one. Owns toast + invalidation. */
export function usePaymentAction() {
	const queryClient = useQueryClient();
	const { t } = useTranslation();

	return useMutation({
		mutationFn: async ({
			type,
			paymentId,
		}: {
			type: PaymentActionType;
			paymentId: string;
		}) => {
			if (type === 'cancel') {
				await paymentsApi.cancel(paymentId);
				return { redirectUrl: null as string | null };
			}
			const res = await paymentsApi.retry(paymentId);
			return { redirectUrl: (res.data?.paymentUrl as string) ?? null };
		},
		onSuccess: ({ redirectUrl }, { type }) => {
			toast.success(type === 'cancel' ? t('payment.cancelled') : t('payment.retried'));
			if (redirectUrl) {
				window.location.href = redirectUrl;
				return;
			}
			queryClient.invalidateQueries({ queryKey: ['profile-payments'] });
		},
		onError: (err: any, { type }) => {
			const fallback =
				type === 'cancel' ? t('payment.cancelFailed') : t('payment.retryFailed');
			toast.error(err?.response?.data?.message || fallback);
		},
	});
}
