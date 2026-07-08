/** @format */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n';
import type { Offer, OfferTab } from '../_lib/types';

/** Offers for one tab (received / sent). Both tabs are queried so the metric
 * cards (computed from the union) stay independent of the active tab. */
export function useOffers(type: OfferTab, enabled: boolean) {
	const query = useQuery({
		queryKey: ['offers', type],
		queryFn: async (): Promise<Offer[]> => {
			const res = await api.get('/offers', { params: { type } });
			return res.data?.data || res.data?.offers || [];
		},
		enabled,
		meta: { page: 'offers' },
	});
	return { offers: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

type OfferActionType = 'accept' | 'reject' | 'cancel';

/** Accept / reject / cancel — one mutation; `pendingId` marks the in-flight offer. */
export function useOfferAction() {
	const queryClient = useQueryClient();
	const { locale } = useTranslation();
	const mutation = useMutation({
		mutationFn: ({ offerId, action }: { offerId: string; action: OfferActionType }) =>
			api.post(`/offers/${offerId}/${action}`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offers'] }),
		onError: (err: any, { action }) => {
			const fallback =
				action === 'accept'
					? locale === 'en'
						? 'Failed to accept offer'
						: 'Teklif kabul edilirken hata oluştu'
					: action === 'reject'
						? locale === 'en'
							? 'Failed to reject offer'
							: 'Teklif reddedilirken hata oluştu'
						: locale === 'en'
							? 'Failed to cancel offer'
							: 'Teklif iptal edilirken hata oluştu';
			toast.error(err?.response?.data?.message || fallback);
		},
	});
	return {
		run: mutation.mutate,
		pendingId: mutation.isPending ? mutation.variables?.offerId ?? null : null,
	};
}

type CounterMode = 'buyer' | 'seller';

/** Buyer (lower) / seller counter offer. */
export function useCounterOffer() {
	const queryClient = useQueryClient();
	const { locale } = useTranslation();
	return useMutation({
		mutationFn: ({
			offerId,
			amount,
			mode,
		}: {
			offerId: string;
			amount: number;
			mode: CounterMode;
		}) =>
			api.post(`/offers/${offerId}/${mode === 'buyer' ? 'buyer-counter' : 'counter'}`, {
				amount,
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offers'] }),
		onError: (err: any) =>
			toast.error(
				err?.response?.data?.message ||
					(locale === 'en' ? 'Failed to send counter' : 'Karşı teklif gönderilemedi'),
			),
	});
}

