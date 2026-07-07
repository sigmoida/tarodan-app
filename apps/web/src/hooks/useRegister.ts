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
 * Individual-registration flow. Field validation lives in `registerSchema`
 * (the form gates on it before calling `submit`), so this hook owns only the
 * `/auth/register` payload shape, the success screen state, and the
 * resend-verification action.
 */
export function useRegister() {
  const { locale } = useTranslation();

  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const submit = async ({
    displayName,
    email,
    phone,
    birthDate,
    password,
    acceptMarketing,
  }: RegisterInput) => {
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
