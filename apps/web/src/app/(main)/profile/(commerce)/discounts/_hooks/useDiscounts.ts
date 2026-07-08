/** @format */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { discountsApi, userApi } from '@/lib/api';
import type { Discount, DiscountFormData, SellerProduct } from '../_lib/types';

const KEY = ['profile-discounts'];

/**
 * All of the seller's discounts (unfiltered). Metrics AND the filtered list both
 * derive from this single dataset, so switching tabs never refetches or moves
 * the metric cards.
 */
export function useDiscounts(enabled: boolean) {
	const query = useQuery({
		queryKey: KEY,
		queryFn: async (): Promise<Discount[]> => {
			const res = await discountsApi.getAll({ limit: 100 });
			const data = res.data;
			return data.items || data || [];
		},
		enabled,
		meta: { page: 'profile-discounts' },
	});
	return { discounts: query.data ?? [], isLoading: query.isLoading };
}

/** Active products for the discount form's product picker. */
export function useSellerProducts(enabled: boolean) {
	const query = useQuery({
		queryKey: ['profile-discounts-products'],
		queryFn: async (): Promise<SellerProduct[]> => {
			const res = await userApi.getMyProducts({ limit: 100, status: 'active' });
			const data = res.data;
			const items: SellerProduct[] = data.data || data.products || data || [];
			return items.filter((p) => p.status === 'active');
		},
		enabled,
		meta: { page: 'profile-discounts-products' },
	});
	return query.data ?? [];
}

function buildPayload(form: DiscountFormData) {
	return {
		code: form.code.trim() || undefined,
		name: form.name,
		description: form.description || undefined,
		type: form.type,
		value: form.value,
		scope: form.scope,
		targetProductIds: form.scope === 'product' ? form.targetProductIds : [],
		minCartValue: form.minCartValue ? parseFloat(form.minCartValue) : undefined,
		maxDiscountAmount: form.maxDiscountAmount ? parseFloat(form.maxDiscountAmount) : undefined,
		usageLimitTotal: form.usageLimitTotal ? parseInt(form.usageLimitTotal) : undefined,
		usageLimitPerUser: parseInt(form.usageLimitPerUser) || 1,
		isStackable: form.isStackable,
		isActive: form.isActive,
		startDate: new Date(form.startDate).toISOString(),
		endDate: new Date(form.endDate + 'T23:59:59').toISOString(),
	};
}

/** Create or update a discount (update when `id` is passed). */
export function useSaveDiscount() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, form }: { id: string | null; form: DiscountFormData }) => {
			const payload = buildPayload(form);
			if (id) await discountsApi.update(id, payload);
			else await discountsApi.create(payload as any);
			return !!id;
		},
		onSuccess: async (wasUpdate) => {
			toast.success(wasUpdate ? 'İndirim güncellendi' : 'İndirim oluşturuldu');
			await queryClient.invalidateQueries({ queryKey: KEY });
		},
		onError: (err: any) => {
			toast.error(err?.response?.data?.message || 'İndirim kaydedilirken hata oluştu');
		},
	});
}

export function useDeleteDiscount() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => discountsApi.delete(id),
		onSuccess: async () => {
			toast.success('İndirim silindi');
			await queryClient.invalidateQueries({ queryKey: KEY });
		},
		onError: () => toast.error('İndirim silinirken hata oluştu'),
	});
}

export function useToggleDiscount() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (discount: Discount) =>
			discountsApi.update(discount.id, { isActive: !discount.isActive }),
		onSuccess: async (_res, discount) => {
			toast.success(discount.isActive ? 'İndirim devre dışı bırakıldı' : 'İndirim aktif edildi');
			await queryClient.invalidateQueries({ queryKey: KEY });
		},
		onError: () => toast.error('Durum güncellenirken hata oluştu'),
	});
}
