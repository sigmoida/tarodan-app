/** @format */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { bankAccountApi } from '@/lib/api';
import { normalizeIban } from '@/lib/iban';
import type { BankAccountValues } from '../_lib/schemas';

export interface BankAccount {
	id: string;
	accountHolder: string;
	iban: string;
	tcKimlikNo?: string | null;
	taxId?: string | null;
	isVerified: boolean;
}

const KEY = ['bank-account'];

export function useBankAccount(enabled: boolean) {
	const query = useQuery({
		queryKey: KEY,
		queryFn: async (): Promise<BankAccount | null> => {
			const res = await bankAccountApi.get();
			return res.data || null;
		},
		enabled,
		meta: { page: 'bank-account' },
	});
	return { account: query.data ?? null, isLoading: query.isLoading };
}

export function useSaveBankAccount() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (values: BankAccountValues) => {
			await bankAccountApi.upsert({
				accountHolder: values.accountHolder.trim(),
				iban: normalizeIban(values.iban),
				...(values.tcKimlikNo ? { tcKimlikNo: values.tcKimlikNo } : {}),
				...(values.taxId ? { taxId: values.taxId } : {}),
			});
		},
		onSuccess: async () => {
			toast.success('Banka hesabı kaydedildi');
			await queryClient.invalidateQueries({ queryKey: KEY });
		},
		onError: (err: any) => {
			const msg = err?.response?.data?.message || 'Kaydetme başarısız';
			toast.error(Array.isArray(msg) ? msg[0] : msg);
		},
	});
}

export function useDeleteBankAccount() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => bankAccountApi.delete(),
		onSuccess: async () => {
			toast.success('Banka hesabı silindi');
			await queryClient.invalidateQueries({ queryKey: KEY });
		},
		onError: (err: any) => toast.error(err?.response?.data?.message || 'Silme başarısız'),
	});
}
