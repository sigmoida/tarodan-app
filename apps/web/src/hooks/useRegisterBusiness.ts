'use client';

import { useState } from 'react';
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
 * (toast on the first failing rule), the `/auth/register/business` payload
 * shape, the success screen state, and the resend-verification action.
 */
export function useRegisterBusiness() {
  const { t, locale } = useTranslation();

  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const submit = async ({
    companyName,
    email,
    phone,
    companyType,
    taxId,
    city,
    district,
    password,
    confirmPassword,
    agreeTerms,
  }: RegisterBusinessInput) => {
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

    // Format phone for API
    const formattedPhone = phone ? '+90' + phone.replace(/\s/g, '') : undefined;

    setIsLoading(true);
    try {
      await api.post('/auth/register/business', {
        companyName,
        email,
        password,
        phone: formattedPhone,
        companyType,
        taxId,
        city,
        district: district || undefined,
        acceptsMarketingEmails: false,
      });
      setRegisteredEmail(email);
      setRegistrationSuccess(true);
      toast.success(
        locale === 'en'
          ? 'Registration successful! Please verify your email.'
          : 'Kayıt başarılı! Lütfen e-postanızı doğrulayın.',
      );
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          (locale === 'en' ? 'Registration failed' : 'Kayıt başarısız'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async () => {
    try {
      await api.post('/auth/resend-verification', {
        email: registeredEmail,
      });
      toast.success(
        locale === 'en'
          ? 'Verification email resent!'
          : 'Doğrulama e-postası tekrar gönderildi!',
      );
    } catch (error) {
      toast.error(
        locale === 'en'
          ? 'Could not resend email'
          : 'E-posta gönderilemedi',
      );
    }
  };

  return { isLoading, registrationSuccess, registeredEmail, submit, resendVerification };
}
