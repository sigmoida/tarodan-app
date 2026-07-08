import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { listingsApi, api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { EditListingFormData } from '../_lib/types';

interface UseListingLifecycleParams {
  id: string;
  formData: EditListingFormData;
  setFormData: Dispatch<SetStateAction<EditListingFormData>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
}

export function useListingLifecycle({ id, formData, setFormData, setIsLoading }: UseListingLifecycleParams) {
  const router = useRouter();
  const { refreshUserData } = useAuthStore();

  const [reactivateQuantity, setReactivateQuantity] = useState('1');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Sync reactivateQuantity with actual product quantity when sold/inactive (so "Yeniden Satışa Aç" shows real stock)
  useEffect(() => {
    if ((formData.status === 'sold' || formData.status === 'inactive') && formData.quantity !== undefined && formData.quantity !== null && formData.quantity !== '') {
      const qty = String(formData.quantity);
      setReactivateQuantity(qty);
    }
  }, [formData.status, formData.quantity]);

  const reactivateMutation = useMutation({
    mutationFn: (qty: number) => listingsApi.update(id, { status: 'active', quantity: qty } as any),
    onSuccess: () => {
      toast.success('İlanınız incelemeye gönderildi. Onaylandığında yeniden yayına girecek.');
      router.push('/profile/listings');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Yeniden satışa açılamadı');
    },
  });

  const handleReactivate = () => {
    const qty = Number(reactivateQuantity);
    if (!qty || qty < 1) {
      toast.error('Geçerli bir stok miktarı giriniz');
      return;
    }
    reactivateMutation.mutate(qty);
  };

  const deactivateMutation = useMutation({
    mutationFn: () => listingsApi.update(id, { status: 'inactive' } as any),
    onMutate: () => {
      setIsLoading(true);
    },
    onSuccess: () => {
      setFormData({ ...formData, status: 'inactive' });
      toast.success('İlan pasife alındı');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const handleDeactivate = () => deactivateMutation.mutate();

  // Satıcı doğrudan aktifleştiremez: istek admin onayına (pending) gider.
  const activateMutation = useMutation({
    mutationFn: () => listingsApi.update(id, { status: 'active' } as any),
    onMutate: () => {
      setIsLoading(true);
    },
    onSuccess: () => {
      setFormData({ ...formData, status: 'pending' });
      toast.success('İlanınız incelemeye gönderildi. Onaylandığında yayına girecek.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const handleActivate = () => activateMutation.mutate();

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/products/${id}`),
    onMutate: () => {
      setIsLoading(true);
    },
    onSuccess: async () => {
      toast.success('İlan silindi');
      // Refresh user data to update listing count
      await refreshUserData();
      // Small delay to ensure backend has processed the deletion
      await new Promise(resolve => setTimeout(resolve, 500));
      router.push('/profile/listings');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'İlan silinemedi');
    },
    onSettled: () => {
      setIsLoading(false);
      setShowDeleteModal(false);
    },
  });

  const handleDelete = () => deleteMutation.mutate();

  const reactivating = reactivateMutation.isPending;

  return {
    reactivateQuantity,
    setReactivateQuantity,
    reactivating,
    showDeleteModal,
    setShowDeleteModal,
    handleReactivate,
    handleDeactivate,
    handleActivate,
    handleDelete,
  };
}
