/** @format */

'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import type { ChangePasswordValues } from '../_lib/schemas';

/** Whether TOTP two-factor auth is currently enabled. */
export function use2faStatus(enabled: boolean) {
	const query = useQuery({
		queryKey: ['profile-2fa-status'],
		queryFn: async (): Promise<boolean> => {
			const res = await api.get('/security/2fa/status').catch(() => null);
			return !!res?.data?.isEnabled;
		},
		enabled,
		meta: { page: 'profile-2fa-status' },
	});
	return { is2faEnabled: query.data ?? false, isLoading: query.isLoading };
}

/** Change the account password. */
export function useChangePassword() {
	const { t } = useTranslation();
	return useMutation({
		mutationFn: async (values: ChangePasswordValues) => {
			await api.post('/security/password/change', {
				currentPassword: values.currentPassword.trim(),
				newPassword: values.newPassword,
			});
		},
		onSuccess: () => toast.success(t('settings.passwordChanged')),
		onError: (err: any) => {
			toast.error(err?.response?.data?.message || 'Şifre değiştirilemedi');
		},
	});
}

/** SMS phone-verification: send a code, then verify it. */
export function usePhoneVerification() {
	const { locale } = useTranslation();
	const refreshUser = useAuthStore((s) => s.refreshUser);

	const sendCode = useMutation({
		mutationFn: (phone: string) => api.post('/auth/phone/send-code', { phone }),
		onSuccess: () => toast.success(locale === 'en' ? 'Code sent' : 'Kod gönderildi'),
		onError: (err: any) =>
			toast.error(err?.response?.data?.message || (locale === 'en' ? 'Failed' : 'Gönderilemedi')),
	});

	const verify = useMutation({
		mutationFn: (code: string) => api.post('/auth/phone/verify', { code }),
		onSuccess: async () => {
			toast.success(locale === 'en' ? 'Phone verified' : 'Telefon doğrulandı');
			await refreshUser();
		},
		onError: (err: any) =>
			toast.error(err?.response?.data?.message || (locale === 'en' ? 'Invalid code' : 'Kod hatalı')),
	});

	return { sendCode, verify };
}
