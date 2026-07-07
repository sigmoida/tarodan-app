/** @format */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { membershipApi, type SavedCard } from '@/lib/api';

/** The user's saved cards (PayTR vault). */
export function useSavedCards(enabled: boolean) {
	const query = useQuery({
		queryKey: ['saved-cards'],
		queryFn: async (): Promise<SavedCard[]> => (await membershipApi.listCards()).data,
		enabled,
	});
	return { cards: query.data ?? [], isLoading: query.isLoading };
}

/** Delete a saved card — owns toast + invalidation. */
export function useDeleteCard() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (cardId: string) => membershipApi.deleteCard(cardId),
		onSuccess: () => {
			toast.success('Kart silindi');
			queryClient.invalidateQueries({ queryKey: ['saved-cards'] });
		},
		onError: (e: any) => toast.error(e?.response?.data?.message || 'Kart silinemedi'),
	});
}
