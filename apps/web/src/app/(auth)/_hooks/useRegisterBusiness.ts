'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n/LanguageContext';
import { api } from '@/lib/api';

interface RegisterBusinessInput {
  companyName: string;
  email: string;
  phone: string;
  companyType: string;
  taxId: string;
  city: string;
  district: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
}

/**
 * Business-registration flow. Preserves the page's exact sequential validation
 * (toast on the first failing rule) ahead of the `/auth/register/business`
 * mutation, plus the success-screen state and the resend-verification action.
 */
export function useRegisterBusiness() {
  const { t, locale } = useTranslation();
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const registerMutation = useMutation({
    mutationFn: (input: RegisterBusinessInput) => {
      const formattedPhone = input.phone
        ? '+90' + input.phone.replace(/\s/g, '')
        : undefined;
      return api.post('/auth/register/business', {
        companyName: input.companyName,
        email: input.email,
        password: input.password,
        phone: formattedPhone,
        companyType: input.companyType,
        taxId: input.taxId,
        city: input.city,
        district: input.district || undefined,
        acceptsMarketingEmails: false,
      });
    },
    onSuccess: (_res, input) => {
      setRegisteredEmail(input.email);
      setRegistrationSuccess(true);
      toast.success(
        locale === 'en'
          ? 'Registration successful! Please verify your email.'
          : 'Kayıt başarılı! Lütfen e-postanızı doğrulayın.',
      );
    },
    onError: (error: any) =>
      toast.error(
        error.response?.data?.message ||
          (locale === 'en' ? 'Registration failed' : 'Kayıt başarısız'),
      ),
  });

  const submit = (input: RegisterBusinessInput) => {
    const { companyName, email, phone, taxId, city, password, confirmPassword, agreeTerms } =
      input;

    if (
      !companyName.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !taxId.trim() ||
      !city.trim() ||
      !password.trim()
    ) {
      toast.error(
        locale === 'en'
          ? 'Please fill in all required fields'
          : 'Lütfen tüm zorunlu alanları doldurun',
      );
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t('validation.passwordMatch'));
      return;
    }

    if (password.length < 8) {
      toast.error(
        locale === 'en'
          ? 'Password must be at least 8 characters'
          : 'Şifre en az 8 karakter olmalıdır',
      );
      return;
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      toast.error(
        locale === 'en'
          ? 'Password must contain at least one uppercase, one lowercase, and one number'
          : 'Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir',
      );
      return;
    }

    if (!agreeTerms) {
      toast.error(
        locale === 'en'
          ? 'You must accept the terms of service'
          : 'Kullanım şartlarını kabul etmelisiniz',
      );
      return;
    }

    return registerMutation.mutateAsync(input).catch(() => {});
  };

  const resendMutation = useMutation({
    mutationFn: () =>
      api.post('/auth/resend-verification', { email: registeredEmail }),
    onSuccess: () =>
      toast.success(
        locale === 'en'
          ? 'Verification email resent!'
          : 'Doğrulama e-postası tekrar gönderildi!',
      ),
    onError: () =>
      toast.error(
        locale === 'en' ? 'Could not resend email' : 'E-posta gönderilemedi',
      ),
  });
  const resendVerification = () => resendMutation.mutate();

  return {
    isLoading: registerMutation.isPending,
    registrationSuccess,
    registeredEmail,
    submit,
    resendVerification,
  };
}
