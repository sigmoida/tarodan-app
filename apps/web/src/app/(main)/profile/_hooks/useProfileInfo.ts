/** @format */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, mediaApi, userApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';

export interface ProfileMe {
	displayName?: string;
	email?: string;
	phone?: string;
	birthDate?: string;
	bio?: string;
	avatarUrl?: string;
	membershipTier?: string;
	companyName?: string;
	taxId?: string;
}

const KEY = ['profile-me'];

/** Fresh profile record for the edit form (independent of the overview query). */
export function useProfileInfo(enabled: boolean) {
	const query = useQuery({
		queryKey: KEY,
		queryFn: async (): Promise<ProfileMe> => {
			const res = await userApi.getProfile();
			return res.data?.user || res.data || {};
		},
		enabled,
		meta: { page: 'profile-info' },
	});
	return { profile: query.data, isLoading: query.isLoading };
}

/** Patch the user's personal (+ business) info. */
export function useUpdateProfile() {
	const queryClient = useQueryClient();
	const { locale } = useTranslation();
	const refreshUser = useAuthStore((s) => s.refreshUser);
	return useMutation({
		mutationFn: async (data: Record<string, unknown>) => {
			const payload: Record<string, unknown> = { ...data };
			Object.keys(payload).forEach((k) => {
				if (payload[k] === '') payload[k] = undefined;
			});
			delete payload.email;
			await api.patch('/users/me', payload);
		},
		onSuccess: async () => {
			await refreshUser();
			await queryClient.invalidateQueries({ queryKey: KEY });
			await queryClient.invalidateQueries({ queryKey: ['profile', 'overview'] });
			toast.success(locale === 'en' ? 'Profile updated' : 'Profil güncellendi');
		},
		onError: (err: any) => {
			toast.error(
				err?.response?.data?.message ||
					(locale === 'en' ? 'Failed to update profile' : 'Profil güncellenemedi'),
			);
		},
	});
}

/** Upload a new avatar → save the S3 key → return a display URL. */
export function useUploadAvatar() {
	const queryClient = useQueryClient();
	const { locale } = useTranslation();
	const refreshUser = useAuthStore((s) => s.refreshUser);
	return useMutation({
		mutationFn: async (file: File): Promise<string> => {
			const uploadRes = await mediaApi.uploadAvatar(file);
			const s3Key = uploadRes.data.key;
			const displayUrl = uploadRes.data.url as string | undefined;
			await api.patch('/users/me', { avatarUrl: s3Key });
			return displayUrl || URL.createObjectURL(file);
		},
		onSuccess: async () => {
			await refreshUser();
			await queryClient.invalidateQueries({ queryKey: KEY });
			toast.success(locale === 'en' ? 'Profile photo updated' : 'Profil fotoğrafı güncellendi');
		},
		onError: (err: any) => {
			toast.error(
				err?.response?.data?.message ||
					(locale === 'en' ? 'Failed to upload photo' : 'Fotoğraf yüklenemedi'),
			);
		},
	});
}
