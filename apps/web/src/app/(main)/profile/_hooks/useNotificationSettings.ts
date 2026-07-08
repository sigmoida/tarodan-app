/** @format */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n';

export interface NotificationSettings {
	emailNotifications: boolean;
	pushNotifications: boolean;
	smsNotifications: boolean;
	marketingEmails: boolean;
	orderUpdates: boolean;
	messageAlerts: boolean;
	priceDropAlerts: boolean;
	newListingAlerts: boolean;
}

export const DEFAULT_SETTINGS: NotificationSettings = {
	emailNotifications: true,
	pushNotifications: true,
	smsNotifications: false,
	marketingEmails: false,
	orderUpdates: true,
	messageAlerts: true,
	priceDropAlerts: true,
	newListingAlerts: false,
};

const KEY = ['profile-notification-settings'];

export function useNotificationSettings(enabled: boolean) {
	const query = useQuery({
		queryKey: KEY,
		queryFn: async (): Promise<NotificationSettings> => {
			const res = await api.get('/users/me/settings').catch(() => null);
			return { ...DEFAULT_SETTINGS, ...(res?.data ?? {}) };
		},
		enabled,
		meta: { page: 'profile-notification-settings' },
	});
	return { settings: query.data ?? DEFAULT_SETTINGS, isLoading: query.isLoading };
}

/** Patch a single notification toggle, optimistically. */
export function useUpdateSetting() {
	const queryClient = useQueryClient();
	const { locale } = useTranslation();
	return useMutation({
		mutationFn: async ({
			key,
			value,
		}: {
			key: keyof NotificationSettings;
			value: boolean;
		}) => {
			await api.patch('/users/me/settings', { [key]: value });
		},
		onMutate: async ({ key, value }) => {
			await queryClient.cancelQueries({ queryKey: KEY });
			const prev = queryClient.getQueryData<NotificationSettings>(KEY);
			queryClient.setQueryData<NotificationSettings>(KEY, (old) => ({
				...(old ?? DEFAULT_SETTINGS),
				[key]: value,
			}));
			return { prev };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev);
			toast.error(locale === 'en' ? 'Failed to update setting' : 'Ayar güncellenemedi');
		},
		onSuccess: () => toast.success(locale === 'en' ? 'Setting updated' : 'Ayar güncellendi'),
	});
}
