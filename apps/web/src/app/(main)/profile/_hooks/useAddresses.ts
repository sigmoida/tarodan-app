/** @format */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { addressesApi } from '@/lib/api';
import { useTranslation } from '@/i18n';
import type { AddressValues } from '../_lib/schemas';

export interface Address extends AddressValues {
	id: string;
}

const KEY = ['profile-addresses'];

export function useAddresses(enabled: boolean) {
	const query = useQuery({
		queryKey: KEY,
		queryFn: async (): Promise<Address[]> => {
			const res = await addressesApi.getAll();
			return res.data.data || res.data || [];
		},
		enabled,
		meta: { page: 'profile-addresses' },
	});
	return { addresses: query.data ?? [], isLoading: query.isLoading };
}

/** Create or update an address (update when `id` is passed). */
export function useSaveAddress() {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		mutationFn: async ({ id, values }: { id: string | null; values: AddressValues }) => {
			const payload = { ...values, title: values.title?.trim() || 'Ev' };
			if (id) await addressesApi.update(id, payload);
			else await addressesApi.create(payload);
			return !!id;
		},
		onSuccess: async (wasUpdate) => {
			toast.success(wasUpdate ? t('address.updated') : t('address.added'));
			await queryClient.invalidateQueries({ queryKey: KEY });
		},
		onError: (err: any) => {
			const msg = err?.response?.data?.message || t('address.saveFailed');
			toast.error(Array.isArray(msg) ? msg[0] : msg);
		},
	});
}

export function useDeleteAddress() {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		mutationFn: (id: string) => addressesApi.delete(id),
		onSuccess: async () => {
			toast.success(t('address.deleted'));
			await queryClient.invalidateQueries({ queryKey: KEY });
		},
		onError: () => toast.error(t('address.deleteFailed')),
	});
}

export function useSetDefaultAddress() {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		mutationFn: (id: string) => addressesApi.setDefault(id),
		onSuccess: async () => {
			toast.success(t('address.defaultUpdated'));
			await queryClient.invalidateQueries({ queryKey: KEY });
		},
		onError: () => toast.error(t('address.defaultFailed')),
	});
}
