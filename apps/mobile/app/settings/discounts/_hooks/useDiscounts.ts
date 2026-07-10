import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { useAuthStore } from '../../../../src/stores/authStore';
import { discountsApi, productsApi } from '../../../../src/services/api';
import { useRefresh } from '../../../../src/hooks/useRefresh';
import { initialForm, type Discount, type MyProduct } from '../_lib/types';

/**
 * Seller discount/coupon management controller — owns the discounts + products
 * queries, filter state, the form/product-picker modal state, and the save/
 * delete/toggle mutations. Lifted verbatim from the monolithic DiscountsScreen.
 */
export function useDiscounts() {
  const { isAuthenticated, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'' | 'active' | 'inactive' | 'expired'>('');
  const [formOpen, setFormOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [form, setForm] = useState(initialForm());
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string }>(
    { visible: false, message: '' },
  );

  const discountsQuery = useQuery({
    queryKey: ['my-discounts'],
    queryFn: async () => {
      const response = await discountsApi.getAll({ limit: 100 });
      const data: any = response.data;
      const items: Discount[] = data?.items ?? data?.data ?? data ?? [];
      return Array.isArray(items) ? items : [];
    },
    enabled: isAuthenticated,
  });

  const productsQuery = useQuery({
    queryKey: ['my-products-for-discount'],
    queryFn: async () => {
      try {
        const response = await productsApi.getMyListings({ limit: 100, status: 'active' });
        const data: any = response.data;
        const items: MyProduct[] = data?.data ?? data?.items ?? data ?? [];
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  const { refreshing, onRefresh } = useRefresh(discountsQuery.refetch, productsQuery.refetch);

  const filteredDiscounts = useMemo(() => {
    const list = discountsQuery.data ?? [];
    const now = new Date();
    if (filter === 'active') {
      return list.filter((d) => d.isActive && d.isCurrentlyValid !== false);
    }
    if (filter === 'inactive') {
      return list.filter((d) => !d.isActive);
    }
    if (filter === 'expired') {
      return list.filter((d) => new Date(d.endDate) < now);
    }
    return list;
  }, [discountsQuery.data, filter]);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (form.id) {
        return discountsApi.update(form.id, payload);
      }
      return discountsApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-discounts'] });
      setFormOpen(false);
      setForm(initialForm());
      setSnackbar({ visible: true, message: form.id ? 'İndirim güncellendi' : 'İndirim oluşturuldu' });
    },
    onError: (e: any) => {
      appAlert('Hata', e?.response?.data?.message || 'İndirim kaydedilemedi.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => discountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-discounts'] });
      setSnackbar({ visible: true, message: 'İndirim silindi' });
    },
    onError: (e: any) => {
      appAlert('Hata', e?.response?.data?.message || 'İndirim silinemedi.');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      discountsApi.update(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-discounts'] });
    },
  });

  const openCreate = () => {
    setForm(initialForm());
    setFormOpen(true);
  };

  const openEdit = (d: Discount) => {
    setForm({
      id: d.id,
      code: d.code ?? '',
      name: d.name,
      description: d.description ?? '',
      type: d.type,
      value: String(d.value),
      scope: d.scope === 'product' ? 'product' : 'seller',
      targetProductIds: d.targetProductIds ?? [],
      minCartValue: d.minCartValue?.toString() ?? '',
      maxDiscountAmount: d.maxDiscountAmount?.toString() ?? '',
      usageLimitTotal: d.usageLimitTotal?.toString() ?? '',
      usageLimitPerUser: String(d.usageLimitPerUser ?? 1),
      isStackable: d.isStackable,
      isActive: d.isActive,
      startDate: d.startDate.split('T')[0],
      endDate: d.endDate.split('T')[0],
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      appAlert('Eksik', 'İndirim adı gerekli.');
      return;
    }
    const valueNum = parseFloat(form.value);
    if (!valueNum || valueNum <= 0) {
      appAlert('Eksik', 'Geçerli bir indirim değeri girin.');
      return;
    }
    if (form.type === 'percentage' && valueNum > 100) {
      appAlert('Hata', 'Yüzde indirim 100\'den büyük olamaz.');
      return;
    }
    if (form.scope === 'product' && form.targetProductIds.length === 0) {
      appAlert('Eksik', 'Lütfen en az bir ürün seçin.');
      return;
    }

    const payload: any = {
      code: form.code.trim() || undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      value: valueNum,
      scope: form.scope,
      targetProductIds: form.scope === 'product' ? form.targetProductIds : [],
      minCartValue: form.minCartValue ? parseFloat(form.minCartValue) : undefined,
      maxDiscountAmount: form.maxDiscountAmount ? parseFloat(form.maxDiscountAmount) : undefined,
      usageLimitTotal: form.usageLimitTotal ? parseInt(form.usageLimitTotal, 10) : undefined,
      usageLimitPerUser: parseInt(form.usageLimitPerUser, 10) || 1,
      isStackable: form.isStackable,
      isActive: form.isActive,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
    };

    saveMutation.mutate(payload);
  };

  const handleDelete = (d: Discount) => {
    appAlert(
      'İndirimi Sil',
      `"${d.name}" indirimini silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate(d.id) },
      ],
    );
  };

  const products = productsQuery.data ?? [];

  return {
    // gates
    isAuthenticated,
    user,
    // list + filter
    filter,
    setFilter,
    discountsQuery,
    filteredDiscounts,
    refreshing,
    onRefresh,
    // form + modals
    form,
    setForm,
    formOpen,
    setFormOpen,
    productPickerOpen,
    setProductPickerOpen,
    openCreate,
    openEdit,
    handleSubmit,
    handleDelete,
    // mutations
    saveMutation,
    toggleActiveMutation,
    // products (picker)
    products,
    productsQuery,
    // snackbar
    snackbar,
    setSnackbar,
  };
}

export type DiscountsController = ReturnType<typeof useDiscounts>;
