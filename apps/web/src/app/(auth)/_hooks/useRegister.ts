'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
 * `/auth/register` mutation, the success-screen state, and the
 * resend-verification action.
 */
export function useRegister() {
  const { locale } = useTranslation();
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => {
      const formattedPhone = input.phone
        ? '+90' + input.phone.replace(/\s/g, '')
        : undefined;
      return api.post('/auth/register', {
        displayName: input.displayName,
        email: input.email,
        password: input.password,
        phone: formattedPhone,
        birthDate: input.birthDate,
        acceptsMarketingEmails: input.acceptMarketing,
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

  const submit = (input: RegisterInput) =>
    registerMutation.mutateAsync(input).catch(() => {});

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
