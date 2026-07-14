import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { normalizePhoneForPayload, splitPhone } from '@/utils/phone';
import { useRefresh } from '@/hooks/useRefresh';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import { EMPTY_FORM, type Address, type AddressForm } from '../_lib/types';

/**
 * Addresses controller — owns the addresses query, save/delete/set-default
 * mutations, the form + field-error state, and the open/edit/delete/submit
 * handlers. Lifted verbatim from the monolithic AddressesScreen.
 */
export function useAddresses() {
  const { t } = useTranslation();
  const { isAuthenticated, limits } = useAuthStore();
  const queryClient = useQueryClient();
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [formData, setFormData] = useState<AddressForm>(EMPTY_FORM());
  // Alan-bazlı görünür validasyon — boş/geçersiz alanlar kırmızı çerçeve + alt mesaj alır.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const maxAddresses = limits?.maxAddresses || 10;

  // Fetch addresses
  const { data: addressesData, isLoading, refetch } = useQuery({
    queryKey: qk.user.addresses,
    queryFn: async () => {
      try {
        const response = await api.get('/users/me/addresses');
        return response.data?.data || response.data || [];
      } catch (error) {
        console.log('Failed to fetch addresses');
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  const addresses: Address[] = addressesData || [];

  const { refreshing, onRefresh } = useRefresh(refetch);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated])
  );

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: AddressForm) => {
      // API CreateAddressDto `zipCode` bekliyor (postalCode değil) — eşle, yoksa posta kodu kaybolur.
      // phoneCountryCode DTO'da yok; telefonu "+90…" olarak normalize edip payload'dan çıkar.
      const { postalCode, phoneCountryCode, ...rest } = data;
      const payload = {
        ...rest,
        phone: normalizePhoneForPayload(data.phone, phoneCountryCode),
        zipCode: postalCode,
      };
      if (editingAddress) {
        return api.patch(`/users/me/addresses/${editingAddress.id}`, payload);
      } else {
        return api.post('/users/me/addresses', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.user.addresses });
      setDialogVisible(false);
      resetForm();
      appAlert('Başarılı', editingAddress ? 'Adres güncellendi' : 'Adres eklendi');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      appAlert('Hata', Array.isArray(msg) ? msg.join('\n') : msg || 'Adres kaydedilemedi');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (addressId: string) => {
      return api.delete(`/users/me/addresses/${addressId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.user.addresses });
      appAlert('Başarılı', 'Adres silindi');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      appAlert('Hata', Array.isArray(msg) ? msg.join('\n') : msg || 'Adres silinemedi');
    },
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (addressId: string) => {
      return api.patch(`/users/me/addresses/${addressId}/default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.user.addresses });
    },
  });

  const resetForm = () => {
    setFormData(EMPTY_FORM());
    setEditingAddress(null);
    setFieldErrors({});
  };

  // Kullanıcı bir alanı düzeltmeye başlayınca o alanın hatasını anında kaldır.
  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const openAddDialog = () => {
    if (addresses.length >= maxAddresses) {
      appAlert(
        'Adres Limiti',
        `Ücretsiz üyeler en fazla ${maxAddresses} adres kaydedebilir. Premium üyelikle daha fazla adres ekleyin.`,
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Premium\'a Geç', onPress: () => router.push('/upgrade') },
        ]
      );
      return;
    }
    resetForm();
    setDialogVisible(true);
  };

  const openEditDialog = (address: Address) => {
    setEditingAddress(address);
    const { countryCode, phone } = splitPhone(address.phone);
    setFormData({
      title: address.title,
      fullName: address.fullName,
      phone,
      phoneCountryCode: countryCode,
      address: address.address,
      city: address.city,
      district: address.district,
      postalCode: address.zipCode ?? address.postalCode ?? '',
      isDefault: address.isDefault,
    });
    setDialogVisible(true);
  };

  const handleDelete = (address: Address) => {
    appAlert(
      'Adresi Sil',
      `"${address.title}" adresini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate(address.id) },
      ]
    );
  };

  const handleSubmit = () => {
    // Alan-bazlı görünür validasyon — her hatalı alan kırmızı çerçeve + alt mesaj alır.
    // API DTO kuralları (adres ≥10 karakter, telefon ≥10 hane) client'ta önden uygulanır;
    // yoksa backend ham 400 "Adres kaydedilemedi" döner.
    const errors: Record<string, string> = {};
    if (!formData.title.trim()) errors.title = 'Zorunlu alan';
    if (!formData.fullName.trim()) errors.fullName = 'Zorunlu alan';
    if (!formData.phone.trim()) errors.phone = 'Zorunlu alan';
    else if (formData.phone.replace(/\D/g, '').length < 10) errors.phone = 'En az 10 haneli geçerli numara';
    if (!formData.address.trim()) errors.address = 'Zorunlu alan';
    else if (formData.address.trim().length < 10) errors.address = 'En az 10 karakter olmalıdır';
    if (!formData.city) errors.city = 'Zorunlu alan';
    if (!formData.district) errors.district = 'Zorunlu alan';

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      // Hatalı alan, kaydırmalı modalda ekran dışında kalabilir → kısa özet alert de göster.
      const hasMissing =
        !formData.title || !formData.fullName || !formData.phone ||
        !formData.address || !formData.city || !formData.district;
      if (hasMissing) {
        appAlert('Hata', 'Lütfen zorunlu alanları doldurun (ilçe dahil)');
      } else if (errors.address) {
        appAlert('Hata', 'Adres en az 10 karakter olmalıdır');
      } else {
        appAlert('Hata', 'Geçerli bir telefon numarası giriniz (en az 10 hane)');
      }
      return;
    }

    saveMutation.mutate(formData);
  };

  return {
    t,
    isAuthenticated,
    addresses,
    maxAddresses,
    isLoading,
    refreshing,
    onRefresh,
    dialogVisible,
    setDialogVisible,
    editingAddress,
    formData,
    setFormData,
    fieldErrors,
    clearFieldError,
    openAddDialog,
    openEditDialog,
    handleDelete,
    handleSubmit,
    saveMutation,
    setDefaultMutation,
  };
}

export type AddressesController = ReturnType<typeof useAddresses>;
