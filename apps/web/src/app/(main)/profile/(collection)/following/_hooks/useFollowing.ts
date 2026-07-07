/** @format */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { FollowedUser } from '../_lib/types';

/** Sellers the current user follows. */
export function useFollowing(enabled: boolean) {
	const query = useQuery({
		queryKey: ['profile-following'],
		queryFn: async (): Promise<FollowedUser[]> => {
			const response = await api.get('/users/me/following');
			const data = response.data.data || response.data.following || response.data || [];
			return Array.isArray(data) ? data : [];
		},
		enabled,
		meta: { page: 'profile-following' },
	});
	return { following: query.data ?? [], isLoading: query.isLoading };
}

/** Unfollow a seller — owns toast + the follow/seller invalidations. */
export function useUnfollow() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (userId: string) => api.delete(`/users/${userId}/follow`),
		onSuccess: async (_data, userId) => {
			toast.success('Takip bırakıldı');
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['profile-following'] }),
				queryClient.invalidateQueries({ queryKey: ['follow', userId] }),
				queryClient.invalidateQueries({ queryKey: ['seller', userId] }),
			]);
		},
		onError: (error: any) => {
			if (process.env.NODE_ENV === 'development') console.error('Unfollow error:', error);
			toast.error('Takip bırakılamadı');
		},
	});
}
