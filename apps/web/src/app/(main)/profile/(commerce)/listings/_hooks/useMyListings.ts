/** @format */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { userApi, api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { Listing } from '../_lib/types';

/** The user's listings for the active status filter. `all` fetches everything. */
export function useMyListings(activeFilter: string, enabled: boolean) {
	const query = useQuery({
		queryKey: ['profile-listings', activeFilter],
		queryFn: async (): Promise<Listing[]> => {
			const params: Record<string, any> = { limit: 100, page: 1 };
			if (activeFilter && activeFilter !== 'all') params.status = activeFilter;
			const response = await userApi.getMyProducts(params);
			const data =
				response.data?.data || response.data?.products || response.data || [];
			return Array.isArray(data) ? data : [];
		},
		enabled,
		meta: { page: 'profile-listings' },
	});

	return { listings: query.data ?? [], isLoading: query.isLoading };
}

/** Delete a listing — owns the toast + cache invalidation (the only way to mutate). */
export function useDeleteListing() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (listingId: string) => {
			await api.delete(`/products/${listingId}`);
			return listingId;
		},
		onSuccess: async (listingId) => {
			toast.success('İlan silindi');
			await useAuthStore.getState().refreshUserData?.();
			await queryClient.invalidateQueries({ queryKey: ['profile-listings'] });
			await queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
		},
		onError: (error: any) => {
			toast.error(error?.response?.data?.message || 'İlan silinemedi');
		},
	});
}
