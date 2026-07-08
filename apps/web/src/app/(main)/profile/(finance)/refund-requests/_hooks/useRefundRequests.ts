/** @format */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { refundsApi } from '@/lib/api';
import { useTranslation } from '@/i18n';
import type { RefundRequest } from '../_lib/types';

/** The buyer's own refund requests (list page). */
export function useRefundRequests(enabled: boolean) {
	const query = useQuery({
		queryKey: ['refund-requests-buyer'],
		queryFn: async (): Promise<RefundRequest[]> => {
			const res = await refundsApi.myRequests();
			return res.data as RefundRequest[];
		},
		enabled,
	});
	return { requests: query.data ?? [], isLoading: query.isLoading };
}

/** A single refund request (detail page). */
export function useRefundDetail(refundId: string, enabled: boolean) {
	const query = useQuery({
		queryKey: ['refund-request', refundId],
		queryFn: async (): Promise<RefundRequest> => {
			const res = await refundsApi.getById(refundId);
			return res.data as RefundRequest;
		},
		enabled: !!refundId && enabled,
	});
	return { refund: query.data, isLoading: query.isLoading };
}

/** Cancel a refund request — owns toast + invalidation. */
export function useCancelRefund(refundId: string) {
	const queryClient = useQueryClient();
	const { locale } = useTranslation();
	return useMutation({
		mutationFn: () => refundsApi.cancel(refundId),
		onSuccess: () => {
			toast.success(locale === 'en' ? 'Request cancelled' : 'Talep iptal edildi');
			queryClient.invalidateQueries({ queryKey: ['refund-request', refundId] });
			queryClient.invalidateQueries({ queryKey: ['refund-requests-buyer'] });
		},
		onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Hata'),
	});
}
