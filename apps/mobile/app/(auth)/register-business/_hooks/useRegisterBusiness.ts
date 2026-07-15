import { useState } from 'react';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useMutation } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { DEFAULT_COUNTRY_CODE, normalizePhoneForPayload } from '@/utils/phone';
import type { BusinessForm } from '../_lib/types';

/**
 * Business-registration controller — owns the form object, the register mutation
 * (token persist + login + verify-email alert), and the field validation. Lifted
 * verbatim from the monolithic screen (§12).
 */
export function useRegisterBusiness() {
  const { login } = useAuthStore();
  const [form, setForm] = useState<BusinessForm>({
    companyName: '',
    taxId: '',
    city: '',
    district: '',
    companyType: '',
    email: '',
    phone: '',
    phoneCountryCode: DEFAULT_COUNTRY_CODE,
    password: '',
    passwordConfirm: '',
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);

  const setField = <K extends keyof BusinessForm>(key: K, value: BusinessForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const registerMutation = useMutation({
    mutationFn: async () => {
      const formattedPhone = normalizePhoneForPayload(form.phone, form.phoneCountryCode);
      return authApi.registerBusiness({
        companyName: form.companyName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: formattedPhone,
        taxId: form.taxId.trim(),
        city: form.city.trim(),
        district: form.district.trim() || undefined,
        companyType: form.companyType.trim() || undefined,
        acceptsMarketingEmails: acceptMarketing,
      });
    },
    onSuccess: async (response) => {
      const data =
        (response.data as { data?: Record<string, unknown> })?.data ??
        ((response.data as Record<string, unknown>) ?? {});
      const tokens = data.tokens as { accessToken?: string; refreshToken?: string } | undefined;
      const accessToken = (tokens?.accessToken ?? data.accessToken ?? data.token) as string | undefined;
      const refreshToken = (tokens?.refreshToken ?? data.refreshToken) as string | undefined;
      if (accessToken) {
        await SecureStore.setItemAsync('accessToken', accessToken);
        if (refreshToken) await SecureStore.setItemAsync('refreshToken', refreshToken);
      }
      if (data.user && login) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await login(accessToken!, data.user as any);
      }
      appAlert(
        'Kurumsal hesap oluşturuldu',
        'E-posta doğrulaması için kayıtlı e-posta adresinize gönderilen bağlantıyı kullanın.',
        [{ text: 'Devam', onPress: () => router.replace('/seller/dashboard') }],
      );
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      appAlert('Hata', err?.response?.data?.message || 'Kayıt tamamlanamadı.');
    },
  });

  const handleSubmit = () => {
    if (!form.companyName.trim()) return appAlert('Eksik', 'Şirket adı gerekli.');
    if (!/^\d{10,11}$/.test(form.taxId.trim()))
      return appAlert('Eksik', 'Vergi / T.C. no 10 veya 11 hane olmalı.');
    if (form.city.trim().length < 2) return appAlert('Eksik', 'Şehir/İl gerekli.');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return appAlert('Eksik', 'Geçerli e-posta girin.');
    // TR için tam 10 hane; diğer ülke kodlarında en az 8 hane yeterli.
    const phoneDigits = form.phone.replace(/\D/g, '');
    const phoneValid =
      form.phoneCountryCode === DEFAULT_COUNTRY_CODE
        ? /^[0-9]{10}$/.test(phoneDigits)
        : phoneDigits.length >= 8;
    if (!phoneValid) return appAlert('Eksik', 'Geçerli bir telefon numarası girin (5XX XXX XX XX).');
    if (form.password.length < 8) return appAlert('Şifre Yetersiz', 'Şifre en az 8 karakter olmalı.');
    if (!/[A-Z]/.test(form.password)) return appAlert('Şifre Yetersiz', 'Şifre en az 1 büyük harf içermeli.');
    if (!/[a-z]/.test(form.password)) return appAlert('Şifre Yetersiz', 'Şifre en az 1 küçük harf içermeli.');
    if (!/\d/.test(form.password)) return appAlert('Şifre Yetersiz', 'Şifre en az 1 rakam içermeli.');
    if (form.password !== form.passwordConfirm) return appAlert('Eksik', 'Şifreler eşleşmiyor.');
    if (!acceptTerms)
      return appAlert('Sözleşme', 'Üyelik sözleşmesini ve KVKK aydınlatmasını kabul etmelisiniz.');
    registerMutation.mutate();
  };

  return {
    form,
    setField,
    acceptTerms,
    setAcceptTerms,
    acceptMarketing,
    setAcceptMarketing,
    registerMutation,
    handleSubmit,
  };
}

export type RegisterBusinessController = ReturnType<typeof useRegisterBusiness>;
