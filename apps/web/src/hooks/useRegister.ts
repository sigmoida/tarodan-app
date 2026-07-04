'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n/LanguageContext';
import { api } from '@/lib/api';

interface RegisterInput {
  displayName: string;
  email: string;
  phone: string;
  birthDate: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
  acceptMarketing: boolean;
}

/**
 * Individual-registration flow. Preserves the page's exact sequential
 * validation (toast on the first failing rule), the `/auth/register` payload
 * shape, the success screen state, and the resend-verification action.
 */
export function useRegister() {
  const { t, locale } = useTranslation();

  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const submit = async ({
    displayName,
    email,
    phone,
    birthDate,
    password,
    confirmPassword,
    agreeTerms,
    acceptMarketing,
  }: RegisterInput) => {
    if (!displayName.trim() || !email.trim() || !password.trim()) {
      toast.error(locale === 'en' ? 'Please fill in all fields' : 'Tüm alanları doldurun');
      return;
    }

    if (!birthDate) {
      toast.error(locale === 'en' ? 'Please enter your birth date' : 'Lütfen doğum tarihinizi girin');
      return;
    }

    const birthDateObj = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const monthDiff = today.getMonth() - birthDateObj.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
      age--;
    }

    if (age < 18) {
      toast.error(locale === 'en'
        ? 'You must be at least 18 years old to register.'
        : 'Kayıt olmak için 18 yaşından büyük olmalısınız.');
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t('validation.passwordMatch'));
      return;
    }

    if (password.length < 8) {
      toast.error(locale === 'en' ? 'Password must be at least 8 characters' : 'Şifre en az 8 karakter olmalıdır');
      return;
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      toast.error(locale === 'en'
        ? 'Password must contain at least one uppercase, one lowercase, and one number'
        : 'Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir');
      return;
    }

    if (!agreeTerms) {
      toast.error(locale === 'en' ? 'You must accept the terms of service' : 'Kullanım şartlarını kabul etmelisiniz');
      return;
    }

    const formattedPhone = phone ? '+90' + phone.replace(/\s/g, '') : undefined;

    setIsLoading(true);
    try {
      await api.post('/auth/register', {
        displayName,
        email,
        password,
        phone: formattedPhone,
        birthDate,
        acceptsMarketingEmails: acceptMarketing,
      });
      setRegisteredEmail(email);
      setRegistrationSuccess(true);
      toast.success(locale === 'en' ? 'Registration successful! Please verify your email.' : 'Kayıt başarılı! Lütfen e-postanızı doğrulayın.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Registration failed' : 'Kayıt başarısız'));
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async () => {
    try {
      await api.post('/auth/resend-verification', { email: registeredEmail });
      toast.success(locale === 'en' ? 'Verification email resent!' : 'Doğrulama e-postası tekrar gönderildi!');
    } catch (error) {
      toast.error(locale === 'en' ? 'Could not resend email' : 'E-posta gönderilemedi');
    }
  };

  return { isLoading, registrationSuccess, registeredEmail, submit, resendVerification };
}
