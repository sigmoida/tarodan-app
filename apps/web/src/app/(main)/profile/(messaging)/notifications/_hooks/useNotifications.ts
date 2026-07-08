/** @format */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n';
import type { Notification } from '../_lib/notifications';

/**
 * Notifications list + read mutations. Replaces the page's inline `useQuery` and
 * hand-rolled `api.patch`/`api.post` calls; both mutations invalidate the list
 * and the header bell counters.
 */
export function useNotifications(enabled: boolean) {
	const queryClient = useQueryClient();
	const { t, locale } = useTranslation();

	const query = useQuery({
		queryKey: ['notifications'],
		queryFn: async (): Promise<Notification[]> => {
			const response = await api.get('/notifications', {
				params: { page: 1, limit: 100 },
			});
			return response.data.notifications || response.data.data || [];
		},
		enabled,
		meta: { page: 'notifications' },
	});

	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ['notifications'] }),
			queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
			queryClient.invalidateQueries({ queryKey: ['notifications-bell'] }),
		]);

	const markRead = useMutation({
		mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
		onSuccess: invalidate,
	});

	const markAllRead = useMutation({
		mutationFn: () => api.post('/notifications/mark-all-read'),
		onSuccess: async () => {
			toast.success(
				locale === 'en' ? 'All marked as read' : 'Tümü okundu olarak işaretlendi',
			);
			await invalidate();
		},
		onError: () => toast.error(t('common.operationFailed')),
	});

	return {
		notifications: query.data ?? [],
		isLoading: query.isLoading,
		markRead: (id: string) => markRead.mutate(id),
		markAllRead: () => markAllRead.mutate(),
	};
}
